"""Versioned HTTP routes and server-side access control."""
import os
import uuid
from pathlib import Path
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, File, Header, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature
from backend.app.contracts.api import (LoginRequest,AuthResponse,HealthResponse,EmployeeList,EmployeeListItem,EventActionRequest,ImportCommitRequest,ImportValidation,ImportCommit,ProfileResponse,CompletionResponse,HrOverview)
from backend.app.contracts.recommendation import RecommendationRequest,RecommendationResult,Preview
from backend.app.core.progress import preview_event
from backend.app.application.employees import profile
from backend.app.application.hr import overview
from backend.app.application.imports import ImportService
from backend.app.data.repository import RepoError

router=APIRouter(prefix='/api/v1')


def fail(code,message):raise RepoError(code,message)

def actual_origin(value):
    p=urlparse(value)
    return f'{p.scheme}://{p.netloc}' if p.scheme and p.netloc else ''

def require_origin(request:Request):
    expected=actual_origin(request.app.state.app_origin)
    received=request.headers.get('origin') or request.headers.get('referer')
    if not received or actual_origin(received)!=expected:fail('FORBIDDEN','Недопустимый источник запроса.')

def actor(request:Request):
    cookie=request.cookies.get('shagra_session')
    if not cookie:fail('UNAUTHENTICATED','Требуется вход.')
    try: session_id=request.app.state.signer.loads(cookie)
    except BadSignature:fail('UNAUTHENTICATED','Требуется вход.')
    session=request.app.state.repo.get_session(session_id)
    if not session:fail('UNAUTHENTICATED','Сессия истекла.')
    return {'session_id':session_id,'actor_id':session['role'] if session['role']=='hr' else 'employee','role':session['role'],'employee_id':session['employee_id']}

def owner_or_hr(employee_id,person):
    if person['role']!='hr' and person['employee_id']!=employee_id:fail('FORBIDDEN','Нет доступа к этому профилю.')

def hr_only(person):
    if person['role']!='hr':fail('FORBIDDEN','Доступно только HR.')

@router.get('/health',response_model=HealthResponse)
async def health(request:Request):
    version=await run_in_threadpool(request.app.state.repo.dataset_version)
    return HealthResponse(status='ok',dataset_version=version,model_status=request.app.state.model_status,provider=request.app.state.provider,model=request.app.state.model)

@router.post('/auth/login',response_model=AuthResponse)
async def login(body:LoginRequest,request:Request,response:Response):
    require_origin(request)
    user=await run_in_threadpool(request.app.state.repo.find_user,body.username,body.password)
    if not user:fail('UNAUTHENTICATED','Неверные учётные данные.')
    session_id=await run_in_threadpool(request.app.state.repo.create_session,user['role'],user['employee_id'])
    signed=request.app.state.signer.dumps(session_id)
    response.set_cookie('shagra_session',signed,httponly=True,samesite='strict',secure=request.app.state.cookie_secure,max_age=8*3600,path='/')
    return AuthResponse(role=user['role'],employee_id=user['employee_id'])

@router.get('/auth/me',response_model=AuthResponse)
async def auth_me(request:Request):
    person=await run_in_threadpool(actor,request)
    return AuthResponse(role=person['role'],employee_id=person['employee_id'])

@router.post('/auth/logout',status_code=204)
async def logout(request:Request,response:Response):
    require_origin(request)
    person=await run_in_threadpool(actor,request)
    await run_in_threadpool(request.app.state.repo.delete_session,person['session_id'])
    response.delete_cookie('shagra_session',path='/')

@router.get('/employees',response_model=EmployeeList)
async def list_employees(request:Request,q:str='',limit:int=50,offset:int=0):
    person=await run_in_threadpool(actor,request);hr_only(person)
    if not 1<=limit<=200 or offset<0:fail('INVALID_REQUEST','Неверные параметры списка.')
    items,total=await run_in_threadpool(request.app.state.repo.list_employees,q,limit,offset)
    return EmployeeList(items=[EmployeeListItem(employee_id=e.employee_id,role_id=e.role_id,grade=e.grade) for e in items],total=total)

@router.get('/employees/{employee_id}',response_model=ProfileResponse)
async def employee_profile(employee_id:str,request:Request):
    person=await run_in_threadpool(actor,request);owner_or_hr(employee_id,person)
    ctx=await run_in_threadpool(request.app.state.repo.get_context,employee_id)
    return await run_in_threadpool(profile,ctx)

@router.post('/employees/{employee_id}/preview',response_model=Preview)
async def preview(employee_id:str,body:EventActionRequest,request:Request):
    require_origin(request)
    person=await run_in_threadpool(actor,request);owner_or_hr(employee_id,person)
    ctx=await run_in_threadpool(request.app.state.repo.get_context,employee_id)
    if body.employee_version!=ctx.employee_version or body.dataset_version!=ctx.dataset_version:fail('STALE_CONTEXT','Профиль изменился. Обновите данные.')
    event=next((e for e in ctx.events if e.event_id==body.event_id),None)
    if not event:fail('NOT_FOUND','Активность не найдена.')
    return await run_in_threadpool(preview_event,ctx,event)

@router.post('/employees/{employee_id}/completions',response_model=CompletionResponse,status_code=201)
async def completion(employee_id:str,body:EventActionRequest,request:Request,response:Response,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key')):
    require_origin(request)
    person=await run_in_threadpool(actor,request);owner_or_hr(employee_id,person)
    result,retry=await run_in_threadpool(request.app.state.repo.complete,person['actor_id'],person['role'],employee_id,body,idempotency_key,True)
    response.status_code=200 if retry else 201
    return result

@router.post('/employees/{employee_id}/recommendations',response_model=RecommendationResult)
async def recommendations(employee_id:str,body:RecommendationRequest,request:Request):
    require_origin(request)
    person=await run_in_threadpool(actor,request);owner_or_hr(employee_id,person)
    ctx=await run_in_threadpool(request.app.state.repo.get_context,employee_id)
    if body.employee_version!=ctx.employee_version or body.dataset_version!=ctx.dataset_version:fail('STALE_CONTEXT','Профиль изменился. Обновите данные.')
    service=request.app.state.recommendation_service
    if service is None:fail('INVALID_REQUEST','Сервис рекомендаций ещё не подключён.')
    result=await service.recommend(ctx,body)
    latest=await run_in_threadpool(request.app.state.repo.get_context,employee_id)
    if latest.employee_version!=ctx.employee_version or latest.dataset_version!=ctx.dataset_version:fail('STALE_CONTEXT','Профиль изменился. Обновите данные.')
    if result.source=='llm':request.app.state.model_status='ready'
    return result

@router.get('/hr/overview',response_model=HrOverview)
async def hr_overview(request:Request):
    person=await run_in_threadpool(actor,request);hr_only(person)
    snapshot=await run_in_threadpool(request.app.state.repo.snapshot)
    return await run_in_threadpool(overview,snapshot)

@router.post('/imports/validate',response_model=ImportValidation)
async def import_validate(request:Request,employees_file:UploadFile=File(...),history_file:UploadFile=File(...)):
    require_origin(request)
    person=await run_in_threadpool(actor,request);hr_only(person)
    employees=await employees_file.read(5*1024*1024+1)
    history=await history_file.read(5*1024*1024+1)
    result=await run_in_threadpool(ImportService(request.app.state.repo).validate,person['actor_id'],employees,history)
    if any(e.code=='FILE_TOO_LARGE' for e in result.errors):fail('FILE_TOO_LARGE','Файл превышает допустимый размер.')
    if not result.valid:return JSONResponse(status_code=422,content=result.model_dump(mode='json'))
    return result

@router.post('/imports/{import_id}/commit',response_model=ImportCommit)
async def import_commit(import_id:str,body:ImportCommitRequest,request:Request):
    require_origin(request)
    person=await run_in_threadpool(actor,request);hr_only(person)
    return await run_in_threadpool(ImportService(request.app.state.repo).commit,person['actor_id'],import_id,body.base_dataset_version)

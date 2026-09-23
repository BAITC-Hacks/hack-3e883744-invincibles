"""The sole dependency assembly point."""
import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI,Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse,FileResponse
from itsdangerous import URLSafeSerializer
from app.data.repository import Repository,RepoError
from app.core.errors import DomainError
from app.http.routes import router
from app.recommendations import RecommendationService

STATUS={'INVALID_REQUEST':400,'UNAUTHENTICATED':401,'FORBIDDEN':403,'NOT_FOUND':404,'STALE_CONTEXT':409,'IDEMPOTENCY_CONFLICT':409,'ALREADY_COMPLETED':409,'IMPORT_CONFLICT':409,'IMPORT_EXPIRED':410,'FILE_TOO_LARGE':413,'INVALID_DATA':422,'UNSUPPORTED_KIT_SCHEMA':422,'INELIGIBLE_EVENT':422,'INCOMPLETE_SKILLS':422}

PROBE_SCHEMA={'type':'object','properties':{'ready':{'type':'boolean'}},'required':['ready'],'additionalProperties':False}
PROBE_PAYLOAD={'instructions':'Проверка доступности модели. Верни ровно {"ready": true} по заданной JSON Schema.',
               'context':{'check':'ready'}}

async def probe_model(app:FastAPI):
    service=app.state.recommendation_service
    try:
        response=await asyncio.wait_for(
            service.provider.rank(PROBE_PAYLOAD,PROBE_SCHEMA,service.timeout_seconds),
            timeout=service.timeout_seconds,
        )
        if response!={'ready':True}:raise ValueError('Invalid readiness response')
        app.state.model_status='ready'
    except Exception:
        if app.state.model_status!='ready':app.state.model_status='unavailable'

def secret(path:Path):
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        try:
            with path.open('x') as file:file.write(os.urandom(32).hex())
            path.chmod(0o600)
        except FileExistsError:pass
    return path.read_text().strip()

def create_app(database_path=None,kit_dir=None,secret_path=None,app_origin=None,recommendation_service=None):
    database_path=Path(database_path or os.getenv('DATABASE_PATH','runtime/shagra.sqlite3'))
    kit_dir=Path(kit_dir or os.getenv('KIT_PATH','data/synthetic'))
    secret_path=Path(secret_path or os.getenv('SESSION_SECRET_PATH',str(database_path.parent/'session-secret')))
    service=recommendation_service if recommendation_service is not None else RecommendationService()
    managed_service=isinstance(service,RecommendationService)
    @asynccontextmanager
    async def lifespan(app:FastAPI):
        task=None
        if managed_service and app.state.model_status=='loading':
            task=asyncio.create_task(probe_model(app))
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with suppress(asyncio.CancelledError):await task
    app=FastAPI(title='ШАГРА',version='1.0.0',lifespan=lifespan)
    repo=Repository(database_path)
    repo.initialize(kit_dir,os.getenv('DEMO_EMPLOYEE_PASSWORD','demo-employee'),os.getenv('DEMO_HR_PASSWORD','demo-hr'))
    app.state.repo=repo
    app.state.signer=URLSafeSerializer(secret(secret_path),salt='shagra-session-v1')
    app.state.app_origin=app_origin or os.getenv('APP_ORIGIN','http://localhost:8080')
    app.state.cookie_secure=(os.getenv('COOKIE_SECURE','false').lower()=='true' or app.state.app_origin.startswith('https://'))
    app.state.provider=service.provider.provider_id if managed_service else os.getenv('AI_PROVIDER','openai').lower()
    if app.state.provider not in ('openai','ollama'):
        raise ValueError('AI_PROVIDER must be openai or ollama')
    app.state.model=service.model if managed_service else (os.getenv('OPENAI_MODEL','gpt-4.1-mini-2025-04-14') if app.state.provider=='openai' else os.getenv('OLLAMA_MODEL','qwen2.5:1.5b'))
    app.state.model_status=('loading' if managed_service and (app.state.provider=='ollama' or bool(getattr(service.provider,'api_key',None))) else 'unavailable')
    app.state.recommendation_service=service

    @app.exception_handler(RepoError)
    async def repo_error(request:Request,exc:RepoError):
        return JSONResponse(status_code=STATUS.get(exc.code,400),content={'error':{'code':exc.code,'message':exc.message,'details':[]},'request_id':'req_'+os.urandom(8).hex()})
    @app.exception_handler(DomainError)
    async def domain_error(request:Request,exc:DomainError):
        return JSONResponse(status_code=STATUS.get(exc.code,422),content={'error':{'code':exc.code,'message':exc.message,'details':[]},'request_id':'req_'+os.urandom(8).hex()})
    @app.exception_handler(RequestValidationError)
    async def validation_error(request:Request,exc:RequestValidationError):
        details=[{'file':None,'path':'.'.join(map(str,e['loc'])),'code':'INVALID_REQUEST','message':e['msg']} for e in exc.errors()]
        return JSONResponse(status_code=400,content={'error':{'code':'INVALID_REQUEST','message':'Неверный запрос.','details':details},'request_id':'req_'+os.urandom(8).hex()})
    app.include_router(router)
    dist=Path(os.getenv('FRONTEND_DIST','frontend/dist'))
    if dist.exists():
        from fastapi.staticfiles import StaticFiles
        app.mount('/assets',StaticFiles(directory=dist/'assets'),name='assets')
        @app.get('/{path:path}',include_in_schema=False)
        async def frontend(path:str):
            target=dist/path
            if target.is_file() and dist in target.resolve().parents:return FileResponse(target)
            return FileResponse(dist/'index.html')
    return app

"""Dependency assembly for the API."""
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title='ШАГРА', version='1.0.0')
    return app

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router

logging.basicConfig(level=logging.INFO, format="%(message)s")

app = FastAPI(
    title       = "Stratum",
    description = "Audio intelligence pipeline API",
    version     = "1.0.0",
)

# Allow NestJS backend to call this
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # tighten this in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
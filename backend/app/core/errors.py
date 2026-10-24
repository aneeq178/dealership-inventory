"""Application errors and the single JSON error envelope used for every non-2xx response.

Envelope: {"error": {"code": "<machine_code>", "message": "<human text>", "details": {...}?}}
The frontend switches on `code`, never on message text.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app")


class AppError(Exception):
    status_code = 500
    code = "internal_error"
    message = "Something went wrong."

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details


class Unauthenticated(AppError):
    status_code = 401
    code = "unauthenticated"
    message = "Authentication required."


class InvalidToken(AppError):
    status_code = 401
    code = "invalid_token"
    message = "Your session is invalid. Please sign in again."


class TokenExpired(AppError):
    status_code = 401
    code = "token_expired"
    message = "Your session has expired. Please sign in again."


class TokenRevoked(AppError):
    status_code = 401
    code = "token_revoked"
    message = "You have been signed out. Please sign in again."


class InvalidCredentials(AppError):
    status_code = 401
    code = "invalid_credentials"
    message = "Incorrect email or password."


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    message = "You do not have permission to perform this action."


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message = "Resource not found."


class VersionConflict(AppError):
    status_code = 409
    code = "version_conflict"
    message = "This record was changed by someone else. Refresh to load the latest version."


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return {"error": err}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse(
            error_body(exc.code, exc.message, exc.details),
            status_code=exc.status_code,
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            error_body("validation_error", "Some fields are invalid.", {"fields": fields}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", exc_info=exc)
        return JSONResponse(error_body("internal_error", AppError.message), status_code=500)

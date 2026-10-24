from uuid import UUID

from fastapi import APIRouter

from app.api.deps import AdminUser, AuthUser
from app.core.db import Conn
from app.schemas.vehicle import VehicleList, VehicleOut, VehicleUpdate
from app.services import vehicles as vehicle_service

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


@router.get("", response_model=VehicleList)
async def list_vehicles(user: AuthUser, conn: Conn) -> VehicleList:
    items = await vehicle_service.list_vehicles(conn, dealership_id=user.dealership_id)
    return VehicleList(items=items)


@router.get("/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(vehicle_id: UUID, user: AuthUser, conn: Conn) -> VehicleOut:
    return await vehicle_service.get_vehicle(
        conn, vehicle_id=vehicle_id, dealership_id=user.dealership_id
    )


@router.put("/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(
    vehicle_id: UUID, body: VehicleUpdate, user: AdminUser, conn: Conn
) -> VehicleOut:
    """Admin only. 409 if `version` is stale, 404 if not in the caller's dealership."""
    return await vehicle_service.update_vehicle(
        conn,
        vehicle_id=vehicle_id,
        dealership_id=user.dealership_id,
        changes=body,
        user_id=user.id,
    )

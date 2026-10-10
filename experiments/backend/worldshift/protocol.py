from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Start(Strict):
    scene_id: str = Field(default="facility", pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    seed_image_path: str | None = Field(default=None, max_length=4096)
    prompt: str = Field(default="First-person industrial research facility", max_length=1000)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 for c in value):
            raise ValueError("Prompt must contain printable text")
        return value


class SessionRequest(Strict):
    session_id: str


class Control(Strict):
    type: Literal["control"]
    seq: int = Field(ge=0, le=2**53-1, strict=True)
    # "shift" = sprint (Waypoint/Biome button 0x10). Additive; WASD unchanged.
    keys: list[Literal["w", "a", "s", "d", "shift"]] = Field(max_length=5)
    mouse_dx: float = Field(default=0, ge=-1000, le=1000)
    mouse_dy: float = Field(default=0, ge=-1000, le=1000)
    timestamp_ms: float = Field(ge=0)


class DisplayAck(Strict):
    type: Literal["display_ack"]
    frame_id: int = Field(ge=0, strict=True)
    epoch: int = Field(ge=0, strict=True)
    client_elapsed_ms: float = Field(ge=0)


BUTTONS = {"w": 87, "a": 65, "s": 83, "d": 68, "shift": 16}

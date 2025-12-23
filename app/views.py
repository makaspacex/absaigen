import json
import logging
from pathlib import Path
from uuid import uuid4

import requests
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import HttpResponseBadRequest, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST
from gradio_client import Client

from .models import MediaRecord

logger = logging.getLogger(__name__)


def index(request):
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return redirect("index")

        context = {
            "login_error": "用户名或密码错误，请重试。",
            "login_username": username,
        }
        return render(request, "index.html", context, status=401)

    return render(request, "index.html")


def logout_view(request):
    if request.method == "POST":
        logout(request)
    return redirect("index")


def _read_audio_bytes(result) -> bytes:
    """
    Attempt to load audio bytes from a gradio_client result which may be:
    - a local file path (str)
    - a URL (str)
    - a list containing the above or dicts with name/path/url
    - a dict with name/path/url
    """
    path = None
    candidate = result
    if isinstance(candidate, (list, tuple)) and candidate:
        candidate = candidate[0]
    if isinstance(candidate, dict):
        path = candidate.get("name") or candidate.get("path") or candidate.get("url")
    elif isinstance(candidate, str):
        path = candidate

    if not path:
        raise ValueError("未找到音频结果路径")

    if isinstance(path, str) and path.startswith("http"):
        resp = requests.get(path, timeout=60)
        resp.raise_for_status()
        return resp.content

    with open(path, "rb") as f:
        return f.read()


def _serialize_record(record: MediaRecord) -> dict:
    return {
        "id": record.id,
        "media_type": record.media_type,
        "model": record.model,
        "prompt": record.prompt,
        "style": record.style,
        "voice": record.voice,
        "url": record.url or "",
        "created_at": record.created_at.isoformat(),
    }


@login_required
@require_GET
def list_records(request):
    records = MediaRecord.objects.all()[:200]
    return JsonResponse({"records": [_serialize_record(r) for r in records]})


@login_required
@require_POST
def create_record(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON body")

    media_type = payload.get("media_type")
    if media_type not in {"image", "audio", "video"}:
        return HttpResponseBadRequest("Invalid media_type")

    model_name = payload.get("model", "").strip() or "unknown"
    prompt = payload.get("prompt", "")
    style = payload.get("style", "")
    voice = payload.get("voice", "")
    result_url = payload.get("url") or payload.get("result_url") or ""

    record = MediaRecord.objects.create(
        media_type=media_type,
        model=model_name,
        prompt=prompt,
        style=style,
        voice=voice,
        result_url=result_url,
    )
    return JsonResponse({"record": _serialize_record(record)}, status=201)


@login_required
@require_POST
def generate_audio(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON body")

    prompt = payload.get("prompt", "").strip()
    model_name = payload.get("model", "").strip() or "广科院"
    voice = payload.get("voice", "").strip()

    if not prompt:
        return HttpResponseBadRequest("prompt is required")

    if model_name in {"广科院", "FishSpeech-1.5"}:
        try:
            client = Client("http://127.0.0.1:9997/FishSpeech-1.5/")
            result = client.predict(
                input_text=prompt,
                voice=voice or "",
                speed=1,
                prompt_speech_file=None,
                prompt_text=prompt,
                api_name="/tts_generate",
            )
            audio_bytes = _read_audio_bytes(result)
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("audio generation request failed")
            return JsonResponse(
                {"error": "请求生成服务失败", "detail": str(exc)}, status=502
            )
    else:
        return JsonResponse({"error": "暂未实现该模型的音频生成"}, status=400)

    suffix = ".mp3"
    if isinstance(result, str):
        suffix = Path(result).suffix or suffix
    filename = f"audio_{uuid4().hex}{suffix}"
    saved_path = default_storage.save(f"audio/{filename}", ContentFile(audio_bytes))
    record = MediaRecord.objects.create(
        media_type="audio",
        model=model_name,
        prompt=prompt,
        voice=voice,
        file=saved_path,
        result_url=default_storage.url(saved_path),
    )

    return JsonResponse({"record": _serialize_record(record)}, status=201)

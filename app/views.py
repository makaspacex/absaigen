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
from django.http.response import FileResponse, HttpResponseNotFound
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST
from gradio_client import Client

from .models import MediaRecord

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent


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


def _read_result_bytes(result) -> bytes:
    """
    Attempt to load binary bytes from a gradio_client result which may be:
    - a local file path (str)
    - a URL (str)
    - a list containing the above or dicts with name/path/url
    - a dict with name/path/url
    """
    if isinstance(result, (bytes, bytearray)):
        return bytes(result)

    path = None
    candidate = result
    if isinstance(candidate, (list, tuple)) and candidate:
        candidate = candidate[0]
    if isinstance(candidate, dict):
        path = (
            candidate.get("name")
            or candidate.get("path")
            or candidate.get("url")
            or candidate.get("video")
            or candidate.get("file")
            or candidate.get("filepath")
            or candidate.get("image")
        )
    elif isinstance(candidate, str):
        path = candidate

    if not path:
        raise ValueError(f"未找到结果文件路径，返回内容: {result!r}")

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
    media_type = request.GET.get("media_type")
    page = max(int(request.GET.get("page", 1)), 1)
    page_size = max(min(int(request.GET.get("page_size", 10)), 50), 1)

    qs = MediaRecord.objects.all()
    if media_type in {"image", "audio", "video"}:
        qs = qs.filter(media_type=media_type)

    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    records = qs[start:end]
    return JsonResponse(
        {
            "records": [_serialize_record(r) for r in records],
            "page": page,
            "page_size": page_size,
            "total": total,
        }
    )


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
def delete_record(request, pk: int):
    try:
        record = MediaRecord.objects.get(pk=pk)
    except MediaRecord.DoesNotExist:
        return HttpResponseNotFound("record not found")

    if record.file and default_storage.exists(record.file.name):
        default_storage.delete(record.file.name)

    record.delete()
    return JsonResponse({"ok": True})


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
            audio_bytes = _read_result_bytes(result)
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


@login_required
@require_POST
def generate_image(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON body")

    prompt = payload.get("prompt", "").strip()
    model_name = payload.get("model", "").strip() or "广科院"
    style = payload.get("style", "")

    if not prompt:
        return HttpResponseBadRequest("prompt is required")

    if model_name != "广科院":
        return JsonResponse({"error": "暂未实现该模型的图像生成"}, status=400)

    service_model = "sd3.5-medium"
    try:
        client = Client(f"http://127.0.0.1:9997/{service_model}/")
        result = client.predict(
            prompt=prompt,
            n=1,
            size_width=1024,
            size_height=1024,
            guidance_scale=-1,
            num_inference_steps=-1,
            negative_prompt=None,
            sampler_name="default",
            api_name="/text_generate_image",
        )
        image_bytes = _read_result_bytes(result)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("image generation request failed")
        return JsonResponse({"error": "图像生成失败", "detail": str(exc)}, status=502)

    suffix = ".png"
    if isinstance(result, str):
        suffix = Path(result).suffix or suffix
    elif isinstance(result, (list, tuple)) and result:
        path = None
        first = result[0]
        if isinstance(first, dict):
            path = first.get("image") or first.get("path") or first.get("name")
        elif isinstance(first, str):
            path = first
        if path:
            suffix = Path(path).suffix or suffix
    filename = f"image_{uuid4().hex}{suffix}"
    saved_path = default_storage.save(f"image/{filename}", ContentFile(image_bytes))
    record = MediaRecord.objects.create(
        media_type="image",
        model=model_name,
        prompt=prompt,
        style=style,
        file=saved_path,
        result_url=default_storage.url(saved_path),
    )

    return JsonResponse({"record": _serialize_record(record)}, status=201)


@login_required
@require_POST
def generate_video(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON body")

    prompt = payload.get("prompt", "").strip()
    model_name = payload.get("model", "").strip() or "广科院"
    negative_prompt = payload.get("negative_prompt", "") or ""
    num_frames = int(payload.get("num_frames", 16) or 16)
    fps = int(payload.get("fps", 8) or 8)
    num_inference_steps = int(payload.get("num_inference_steps", 25) or 25)
    guidance_scale = float(payload.get("guidance_scale", 7.5) or 7.5)
    width = int(payload.get("width", 512) or 512)
    height = int(payload.get("height", 512) or 512)

    if not prompt:
        return HttpResponseBadRequest("prompt is required")

    if model_name != "广科院":
        return JsonResponse({"error": "暂未实现该模型的视频生成"}, status=400)

    service_model = "Wan2.1-1.3B"
    try:
        client = Client(f"http://127.0.0.1:9997/{service_model}/")
        result = client.predict(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_frames=num_frames,
            fps=fps,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            width=width,
            height=height,
            api_name="/text_generate_video",
        )
        video_bytes = _read_result_bytes(result)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("video generation request failed")
        message = str(exc)
        if "ftfy" in message.lower():
            message = "xinference 模型环境缺少 ftfy，请在运行 xinference 的环境执行 `pip install ftfy` 并重启服务。"
        return JsonResponse({"error": "视频生成失败", "detail": message}, status=502)

    suffix = ".mp4"
    if isinstance(result, str):
        suffix = Path(result).suffix or suffix
    filename = f"video_{uuid4().hex}{suffix}"
    saved_path = default_storage.save(f"video/{filename}", ContentFile(video_bytes))
    record = MediaRecord.objects.create(
        media_type="video",
        model=model_name,
        prompt=prompt,
        file=saved_path,
        result_url=default_storage.url(saved_path),
    )

    return JsonResponse({"record": _serialize_record(record)}, status=201)


@login_required
@require_GET
def download_record(request, pk: int):
    try:
        record = MediaRecord.objects.get(pk=pk)
    except MediaRecord.DoesNotExist:
        return HttpResponseNotFound("record not found")

    if record.file:
        file_path = Path(record.file.path)
        if file_path.exists():
            return FileResponse(
                file_path.open("rb"),
                as_attachment=True,
                filename=file_path.name,
            )
    if record.result_url:
        return redirect(record.result_url)
    return HttpResponseNotFound("file not found")


@login_required
@require_POST
def download_records_zip(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON body")

    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return HttpResponseBadRequest("ids is required")

    records = MediaRecord.objects.filter(id__in=ids)
    files = []
    for rec in records:
        if rec.file and default_storage.exists(rec.file.name):
            files.append(Path(default_storage.path(rec.file.name)))

    if not files:
        return HttpResponseNotFound("no files to download")

    import io
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in files:
            zip_file.write(file_path, arcname=file_path.name)
    buffer.seek(0)

    return FileResponse(
        buffer,
        as_attachment=True,
        filename="media_batch.zip",
    )

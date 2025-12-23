from django.db import models


class MediaRecord(models.Model):
    MEDIA_TYPE_CHOICES = [
        ("image", "Image"),
        ("audio", "Audio"),
        ("video", "Video"),
    ]
    id = models.AutoField(primary_key=True)
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES)
    model = models.CharField(max_length=100)
    prompt = models.TextField(blank=True)
    style = models.CharField(max_length=100, blank=True)
    voice = models.CharField(max_length=100, blank=True)
    file = models.FileField(upload_to="outputs/", blank=True, null=True)
    result_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.media_type} - {self.model} @ {self.created_at:%Y-%m-%d %H:%M:%S}"

    @property
    def url(self) -> str:
        if self.file:
            return self.file.url
        return self.result_url

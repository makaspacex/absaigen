from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("logout/", views.logout_view, name="logout"),
    path("api/records/", views.list_records, name="list_records"),
    path("api/records/create/", views.create_record, name="create_record"),
    path("api/records/<int:pk>/delete/", views.delete_record, name="delete_record"),
    path("api/records/<int:pk>/download/", views.download_record, name="download_record"),
    path("api/records/download/", views.download_records_zip, name="download_records_zip"),
    path("api/audio/", views.generate_audio, name="generate_audio"),
    path("api/video/", views.generate_video, name="generate_video"),
]

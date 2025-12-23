from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("logout/", views.logout_view, name="logout"),
    path("api/records/", views.list_records, name="list_records"),
    path("api/records/create/", views.create_record, name="create_record"),
    path("api/audio/", views.generate_audio, name="generate_audio"),
]

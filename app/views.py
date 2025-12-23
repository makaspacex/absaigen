from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render


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

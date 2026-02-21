from django.core.cache import cache
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Student


class StudentJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        student_id = validated_token.get('student_id')
        if not student_id:
            raise AuthenticationFailed('Tokenda student_id mavjud emas')

        cache_key = f'student_auth_{student_id}'
        student = cache.get(cache_key)
        if student is not None:
            return student

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            raise AuthenticationFailed('Talaba topilmadi')

        cache.set(cache_key, student, timeout=60)
        return student


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Student)

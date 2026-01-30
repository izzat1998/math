from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Student


class StudentJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        student_id = validated_token.get('student_id')
        if not student_id:
            raise AuthenticationFailed('Tokenda student_id mavjud emas')
        try:
            return Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            raise AuthenticationFailed('Talaba topilmadi')


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Student)

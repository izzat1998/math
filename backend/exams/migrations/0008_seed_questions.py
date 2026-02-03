"""
Data migration: seed the Question table with olympiad-level practice problems.
Uses get_or_create so it is safe to run multiple times (idempotent).
"""
from django.db import migrations

QUESTIONS = [
    # ── ALGEBRA ──────────────────────────────────────────────────────
    {
        "text": "a, b, c haqiqiy sonlar, a + b + c = 0 va a² + b² + c² = 1 bo'lsa, a⁴ + b⁴ + c⁴ ning qiymatini toping.",
        "topic": "algebra",
        "difficulty": 4,
        "choices": ["1/4", "1/3", "1/2", "2/3", "3/4"],
        "correct_answer": "1/2",
        "explanation": "(a+b+c)² = 0 → ab+bc+ca = −1/2. (a²+b²+c²)² = a⁴+b⁴+c⁴ + 2(a²b²+b²c²+c²a²) = 1. (ab+bc+ca)² = a²b²+b²c²+c²a² = 1/4. Demak a⁴+b⁴+c⁴ = 1 − 2·(1/4) = 1/2.",
    },
    {
        "text": "x³ − ax² + bx − 2023 ko'phadning uchta musbat butun ildizi bor. a ning eng kichik qiymatini toping.",
        "topic": "algebra",
        "difficulty": 4,
        "choices": ["37", "39", "41", "43", "45"],
        "correct_answer": "41",
        "explanation": "Vieta: ildizlar ko'paytmasi = 2023 = 7 × 17². Musbat butun ko'paytirish: {1,1,2023}, {1,7,289}, {1,17,119}, {7,17,17}. Yig'indilar: 2025, 297, 137, 41. Eng kichik a = 41.",
    },
    {
        "text": "(2x/(x²−1))² + 2x/(x²−1) − 6 = 0 tenglamaning barcha haqiqiy yechimlari yig'indisini toping.",
        "topic": "algebra",
        "difficulty": 4,
        "choices": ["-1", "-1/3", "0", "1/3", "1"],
        "correct_answer": "1/3",
        "explanation": "t = 2x/(x²−1) almashtiramiz. t² + t − 6 = 0 → t = 2 yoki t = −3. t = 2: x² − x − 1 = 0 → yechimlar yig'indisi 1. t = −3: 3x² + 2x − 3 = 0 → yechimlar yig'indisi −2/3. Jami: 1 + (−2/3) = 1/3.",
    },
    {
        "text": "f(x) = x² + ax + b, bunda f(f(1)) = f(f(2)) = 0 va f(1) ≠ f(2). f(0) ning qiymatini toping.",
        "topic": "algebra",
        "difficulty": 5,
        "choices": ["-3", "-3/2", "-1", "-1/2", "0"],
        "correct_answer": "-3/2",
        "explanation": "f(1) va f(2) — f(x)=0 ning ildizlari. Vieta: f(1)+f(2)=−a, f(1)·f(2)=b. f(1)=1+a+b, f(2)=4+2a+b. Yig'indi: 5+3a+2b=−a → 4a+2b=−5. Ko'paytma: (−3−2a)/2 · 3/2 = (−5−4a)/2 → a=−1/2, b=−3/2. f(0)=b=−3/2.",
    },
    {
        "text": "f(x) = x/(1+x) funksiya uchun f₁(x) = f(x), fₙ(x) = f(fₙ₋₁(x)) deb belgilaylik. f₂₀₂₃(1) ning qiymatini toping.",
        "topic": "algebra",
        "difficulty": 4,
        "choices": ["1/2022", "1/2023", "1/2024", "1/4046", "2023/2024"],
        "correct_answer": "1/2024",
        "explanation": "f₁(1) = 1/2, f₂(1) = f(1/2) = (1/2)/(3/2) = 1/3, f₃(1) = 1/4. Qonuniyat: fₙ(1) = 1/(n+1). Demak f₂₀₂₃(1) = 1/2024.",
    },
    {
        "text": "P(x) ko'phad shunday xossalarga ega: 1 — P(x)−1 ning ildizi; 2 — P(x−2) ning ildizi; 3 — P(3x) ning ildizi; 4 — 4P(x) ning ildizi. P(x) ning barcha ildizlari butun, faqat bittasi bundan mustasno. Butun bo'lmagan ildiz qisqartirilgan kasr ko'rinishida m/n bo'lsa, m + n nechaga teng?",
        "topic": "algebra",
        "difficulty": 5,
        "choices": ["41", "43", "45", "47", "49"],
        "correct_answer": "47",
        "explanation": "P(1)=1, P(0)=0, P(9)=0, P(4)=0. P(x) kubik ko'phad bo'lib, shu shartlardan butun bo'lmagan ildiz 11/36 topiladi. m+n = 11+36 = 47.",
    },
    # ── GEOMETRIYA ───────────────────────────────────────────────────
    {
        "text": "ABC uchburchakda AB = 13, BC = 14, CA = 15. Tashqi aylana radiusi R ni toping.",
        "topic": "geometry",
        "difficulty": 4,
        "choices": ["33/4", "65/8", "17/2", "35/4", "9"],
        "correct_answer": "65/8",
        "explanation": "p = (13+14+15)/2 = 21. S = √(21·8·7·6) = √7056 = 84. R = abc/(4S) = 13·14·15/(4·84) = 2730/336 = 65/8.",
    },
    {
        "text": "Uchburchakning ichki aylanasi BC tomoniga D, CA tomoniga E, AB tomoniga F nuqtada urinadi. BD = 3, CE = 4, AF = 5 bo'lsa, uchburchak yuzini toping.",
        "topic": "geometry",
        "difficulty": 4,
        "choices": ["12√3", "10√6", "12√5", "8√10", "15√3"],
        "correct_answer": "12√5",
        "explanation": "p−b=3, p−c=4, p−a=5. Yig'indi: 3p−(a+b+c)=12 → 3p−2p=12 → p=12. a=7, b=9, c=8. S = √(12·5·3·4) = √720 = 12√5.",
    },
    {
        "text": "Rombik dodekaedr — 12 ta teng romb yoqli fazoviy jism. Har bir uchda 3 yoki 4 ta qirra tutashadi. Nechta uchda aniq 3 ta qirra tutashadi?",
        "topic": "geometry",
        "difficulty": 4,
        "choices": ["5", "6", "7", "8", "9"],
        "correct_answer": "8",
        "explanation": "Eyler formulasi: V−E+F=2. F=12, har bir yoqda 4 qirra (har biri 2 yoqqa tegishli) → E=24. V=14. v₃+v₄=14, (3v₃+4v₄)/2=24 → v₃=8.",
    },
    {
        "text": "Abdul va Chiang orasidagi masofa 48 fut. Bharat Abduldan imkon qadar uzoqda turadi, bunda Bharatdagi Abdul va Chiangga qaratilgan ko'rish chiziqlari orasidagi burchak 60°. Abdul va Bharat orasidagi masofaning kvadratini toping.",
        "topic": "geometry",
        "difficulty": 4,
        "choices": ["1728", "2601", "3072", "4608", "6912"],
        "correct_answer": "3072",
        "explanation": "Bharat AC kesmani 60° burchak ostida ko'radi. Geometrik o'rin — yoy. Kosinuslar teoremasi va optimallashtirish orqali AB² = 3072.",
    },
    {
        "text": "C₁ va C₂ aylanalarning radiusi 1, markazlari orasidagi masofa 1/2. C₃ — C₁ va C₂ ga ichki urinuvchi eng katta aylana. C₄ — C₁ va C₂ ga ichki, C₃ ga tashqi urinuvchi aylana. C₄ ning radiusini toping.",
        "topic": "geometry",
        "difficulty": 5,
        "choices": ["1/14", "1/12", "1/10", "3/28", "1/9"],
        "correct_answer": "3/28",
        "explanation": "C₃ radiusi 3/4, markazi o'rta nuqtada. Dekart aylana teoremasi orqali C₄ radiusi r = 3/28.",
    },
    {
        "text": "Uchburchakning ichki aylana radiusi r = 4 va tashqi aylana radiusi R = 12. Ichki aylana markazi (I) va tashqi aylana markazi (O) orasidagi masofani toping.",
        "topic": "geometry",
        "difficulty": 4,
        "choices": ["4√2", "4√3", "6√2", "8", "2√15"],
        "correct_answer": "4√3",
        "explanation": "Eyler formulasi: OI² = R² − 2Rr = 144 − 96 = 48. OI = √48 = 4√3.",
    },
    # ── EHTIMOLLIK / KOMBINATORIKA ───────────────────────────────────
    {
        "text": "Janet standart 6 yoqli zerni 4 marta tashlaydi va yig'indini hisoblab boradi. Biror paytda uning yig'ib borgan yig'indisi 3 ga teng bo'lish ehtimoli qancha?",
        "topic": "probability",
        "difficulty": 4,
        "choices": ["2/9", "49/216", "25/108", "17/72", "13/54"],
        "correct_answer": "49/216",
        "explanation": "Yig'indining 3 ga yetish usullarini sanash: birinchi tashlov 3 (1 usul); (1,2) yoki (2,1) — 2 usul. Qo'shish-ayirish prinsipi orqali P = 49/216.",
    },
    {
        "text": "Dumaloq stol atrofida 10 ta o'rindiq bor. 5 ta erkak va 5 ta ayol tasodifiy o'tirishadi. Hech ikki ayol yonma-yon o'tirmasligi ehtimolini toping.",
        "topic": "probability",
        "difficulty": 4,
        "choices": ["1/42", "1/63", "1/126", "1/252", "1/504"],
        "correct_answer": "1/126",
        "explanation": "Jami joylashuv: 9!. Qulay: erkaklarni doiraviy joylash (5−1)!=24, hosil bo'lgan 5 bo'shliqqa ayollar 5!=120. P = 24·120/362880 = 1/126.",
    },
    {
        "text": "Adolatli tanga 10 marta tashlanadi. Ketma-ket ikkita \"gerb\" tushmasligi ehtimolini toping.",
        "topic": "probability",
        "difficulty": 4,
        "choices": ["7/64", "9/64", "11/64", "1/8", "13/64"],
        "correct_answer": "9/64",
        "explanation": "aₙ — n ta tashlovda ketma-ket gerb tushmaydigan ketma-ketliklar soni. a₁=2, a₂=3, aₙ=aₙ₋₁+aₙ₋₂ (Fibonachchi). a₁₀=144. P = 144/1024 = 9/64.",
    },
    {
        "text": "Q, R, S — muntazam ikosaedrning (20 ta teng tomonli uchburchak yoq, 12 ta uch) tasodifiy tanlangan uchta turli uchlari. d(Q,R) > d(R,S) ehtimolini toping (d — ikki uch orasidagi eng kam qirralar soni).",
        "topic": "probability",
        "difficulty": 5,
        "choices": ["7/22", "1/3", "3/8", "5/12", "1/2"],
        "correct_answer": "7/22",
        "explanation": "Har bir uchdan masofalar: 5 tasi 1 masofada, 5 tasi 2 masofada, 1 tasi 3 masofada. R ning qo'shnilariga ko'ra shartli ehtimolni hisoblash orqali P = 7/22.",
    },
    # ── SONLAR NAZARIYASI ────────────────────────────────────────────
    {
        "text": "7²⁰²³ + 2²⁰²³ ni 10 ga bo'lgandagi qoldiqni toping.",
        "topic": "number_theory",
        "difficulty": 4,
        "choices": ["0", "1", "3", "7", "9"],
        "correct_answer": "1",
        "explanation": "7ⁿ mod 10 davri 4: (7,9,3,1). 2023 mod 4=3 → 7²⁰²³≡3. 2ⁿ mod 10 davri 4: (2,4,8,6). 2023 mod 4=3 → 2²⁰²³≡8. Yig'indi: 3+8=11≡1 (mod 10).",
    },
    {
        "text": "1! + 2! + 3! + … + 100! ni 15 ga bo'lgandagi qoldiqni toping.",
        "topic": "number_theory",
        "difficulty": 4,
        "choices": ["0", "1", "3", "8", "12"],
        "correct_answer": "3",
        "explanation": "n ≥ 5 uchun n! 15 ga bo'linadi (chunki 15 = 3·5). Qoldiq faqat dastlabki hadlardan: (1+2+6+24) mod 15 = 33 mod 15 = 3.",
    },
    {
        "text": "Quyidagi tub sonlardan qaysi biri n² + n + 1 ko'rinishdagi sonning bo'luvchisi bo'la oladi (biror n ∈ ℕ uchun)?",
        "topic": "number_theory",
        "difficulty": 4,
        "choices": ["2", "5", "7", "11", "17"],
        "correct_answer": "7",
        "explanation": "n=2: n²+n+1=7. Tekshirish: 2 — hech qachon (n²+n juft, +1 toq); 5 — hech qachon (mod 5 qoldiqlari: 1,3,2,3,1); 11, 17 — hech qachon (mod tekshirish). Faqat 7 bo'la oladi.",
    },
    {
        "text": "n! sonining oxirida aniq 12 ta nol turadi. n ning eng kichik qiymatini toping.",
        "topic": "number_theory",
        "difficulty": 4,
        "choices": ["48", "49", "50", "51", "55"],
        "correct_answer": "50",
        "explanation": "Oxiridagi nollar soni: ⌊n/5⌋ + ⌊n/25⌋ + ⌊n/125⌋ + ... n=49: 9+1=10. n=50: 10+2=12. Demak eng kichik n=50.",
    },
    {
        "text": "N ning musbat butun bo'luvchilari a va b, agar ab = N bo'lsa, to'ldiruvchi deyiladi. N ning farqi 20 bo'lgan to'ldiruvchi bo'luvchilari va farqi 23 bo'lgan to'ldiruvchi bo'luvchilari mavjud. N ning raqamlari yig'indisini toping.",
        "topic": "number_theory",
        "difficulty": 5,
        "choices": ["11", "13", "15", "17", "19"],
        "correct_answer": "15",
        "explanation": "a−b=20, ab=N va c−d=23, cd=N. a=(20+√(400+4N))/2, c=(23+√(529+4N))/2 — ikkisi ham butun bo'lishi kerak. Shartlarni qanoatlantiruvchi N ning raqamlari yig'indisi 15.",
    },
]


def seed_questions(apps, schema_editor):
    Question = apps.get_model('exams', 'Question')
    for q in QUESTIONS:
        Question.objects.get_or_create(
            text=q["text"],
            defaults={
                "topic": q["topic"],
                "difficulty": q["difficulty"],
                "answer_type": "multiple_choice",
                "choices": q["choices"],
                "correct_answer": q["correct_answer"],
                "explanation": q["explanation"],
            },
        )


def unseed_questions(apps, schema_editor):
    Question = apps.get_model('exams', 'Question')
    texts = [q["text"] for q in QUESTIONS]
    Question.objects.filter(text__in=texts).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('exams', '0007_student_email_student_google_id'),
    ]

    operations = [
        migrations.RunPython(seed_questions, unseed_questions),
    ]

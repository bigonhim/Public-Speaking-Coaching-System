"""Analysis services for the speaking coach.

`transcription` and `relevance` may perform I/O and import heavy ML libraries
(lazily). `metrics`, `scoring`, `feedback` and `levels` are PURE: no Django, no
I/O, no framework imports — plain data in, plain data out — so the academic
core is unit-testable and provable.
"""

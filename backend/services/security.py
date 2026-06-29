"""
Security utilities for prompt injection detection.
"""

import re

# Common prompt injection phrases
BLOCKLIST_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions?",
    r"forget\s+(all\s+)?previous\s+instructions?",
    r"ignore\s+the\s+system\s+prompt",
    r"reveal\s+(your\s+)?system\s+prompt",
    r"developer\s+prompt",
    r"system\s+prompt",
    r"jailbreak",
    r"bypass\s+(your\s+)?restrictions?",
    r"pretend\s+to\s+be",
    r"act\s+as",
    r"you\s+are\s+now",
    r"disregard\s+previous\s+instructions?",
    r"override\s+instructions?",
    r"do\s+anything\s+now",
]

COMPILED_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in BLOCKLIST_PATTERNS
]


def is_prompt_injection(text: str) -> bool:
    """
    Returns True if the question matches
    common prompt injection attempts.
    """

    if not text:
        return False

    for pattern in COMPILED_PATTERNS:
        if pattern.search(text):
            return True

    return False
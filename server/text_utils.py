import re


def clean_markdown(text: str | None) -> str | None:
    """Remove common markdown formatting from text for voice output.
    This version is designed to work with streaming text where we might
    not have complete markdown patterns."""
    if not text:
        return text

    # For streaming, we need to be more conservative
    # Only remove patterns we're absolutely sure are complete

    # Remove asterisks and underscores only if they appear in pairs
    # and contain text between them (complete bold/italic patterns)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)  # Bold
    text = re.sub(r"\*([^*]+)\*", r"\1", text)  # Italic
    text = re.sub(r"__([^_]+)__", r"\1", text)  # Bold
    text = re.sub(r"_([^_]+)_", r"\1", text)  # Italic

    # Remove backticks only if we have a complete inline code pattern
    text = re.sub(r"`([^`]+)`", r"\1", text)

    # Remove complete links
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

    # Remove headers at the start of lines
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)

    # Remove list markers at the start of lines
    text = re.sub(r"^[\*\-\+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)

    # Don't modify whitespace aggressively since we're streaming

    return text

"""
Tests for text_utils.py - clean_markdown utility function.
"""

from text_utils import clean_markdown


def test_empty_string():
    """Empty string returns empty string (falsy short-circuit)."""
    assert clean_markdown("") == ""


def test_none_returns_none():
    """None returns None (falsy short-circuit)."""
    assert clean_markdown(None) is None


def test_plain_text_unchanged():
    """Plain text without markdown is unchanged."""
    text = "Hello, this is plain text."
    assert clean_markdown(text) == text


def test_removes_bold_asterisks():
    """Bold with double asterisks is stripped."""
    assert clean_markdown("This is **bold** text") == "This is bold text"


def test_removes_bold_underscores():
    """Bold with double underscores is stripped."""
    assert clean_markdown("This is __bold__ text") == "This is bold text"


def test_removes_italic_asterisks():
    """Italic with single asterisks is stripped."""
    assert clean_markdown("This is *italic* text") == "This is italic text"


def test_removes_italic_underscores():
    """Italic with single underscores is stripped."""
    assert clean_markdown("This is _italic_ text") == "This is italic text"


def test_removes_inline_code():
    """Inline code backticks are stripped."""
    assert clean_markdown("Use the `print()` function") == "Use the print() function"


def test_removes_links():
    """Markdown links keep their link text and drop the URL."""
    assert clean_markdown("Check out [GitHub](https://github.com)") == "Check out GitHub"


def test_removes_headers():
    """Leading markdown headers are stripped."""
    assert clean_markdown("# Header One") == "Header One"
    assert clean_markdown("## Header Two") == "Header Two"
    assert clean_markdown("### Header Three") == "Header Three"


def test_removes_list_marker_asterisk():
    """Asterisk list markers are stripped."""
    assert clean_markdown("* Item one") == "Item one"


def test_removes_list_marker_dash():
    """Dash list markers are stripped."""
    assert clean_markdown("- Item one") == "Item one"


def test_removes_list_marker_plus():
    """Plus list markers are stripped."""
    assert clean_markdown("+ Item one") == "Item one"


def test_removes_numbered_list():
    """Numbered list markers are stripped."""
    assert clean_markdown("1. First item") == "First item"
    assert clean_markdown("10. Tenth item") == "Tenth item"


def test_complex_mixed_markdown():
    """Multiple markdown elements in one string are all stripped."""
    text = "**Bold** and *italic* with `code` and [link](http://example.com)"
    expected = "Bold and italic with code and link"
    assert clean_markdown(text) == expected

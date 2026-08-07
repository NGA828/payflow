#!/usr/bin/env python3
"""
Progressive-enhancement form driver for manual E2E testing.

Server-action forms rendered by Next.js include hidden $ACTION fields for
no-JS submissions. This fetches a page, extracts those fields, and POSTs them
back with your data — exactly like a browser with JavaScript disabled.

Usage:
  python3 scripts/pe-drive.py <url> <cookie-jar> [field=value ...]

Example:
  python3 scripts/pe-drive.py "http://127.0.0.1:3000/setup?step=1" /tmp/e2e.txt \
      name="Acme SARL" country=CM

Notes: only standard-library Python. Multi-form pages submit their FIRST form
unless it contains no $ACTION fields, in which case the second form is tried.
"""
import http.cookiejar
import re
import sys
import urllib.request


def extract_hidden(form_html):
    fields = {}
    for match in re.finditer(
        r'<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?/?>', form_html
    ):
        name, value = match.group(1), match.group(2) or ""
        fields[name] = value.replace("&quot;", '"').replace("&amp;", "&")
    return fields


def forms_of(html):
    chunks = re.split(r"<form", html)
    return ["<form" + chunk.split("</form>")[0] for chunk in chunks[1:]]


def main():
    url, cookie_path = sys.argv[1], sys.argv[2]
    overrides = dict(arg.split("=", 1) for arg in sys.argv[3:])

    jar = http.cookiejar.MozillaCookieJar(cookie_path)
    try:
        jar.load(ignore_discard=True, ignore_expires=True)
    except Exception:
        pass
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    html = opener.open(url).read().decode("utf-8", "replace")

    hidden = {}
    for form in forms_of(html):
        hidden = extract_hidden(form)
        if hidden:
            break
    if not hidden:
        print("FAIL: no server-action form found on", url)
        sys.exit(1)

    data = {**hidden, **overrides}
    body = "&".join(
        f"{urllib.parse.quote(k)}={urllib.parse.quote(v)}" for k, v in data.items()
    )
    # Next expects multipart for PE posts; urlencoded works in practice, but
    # multipart is the faithful encoding:
    import uuid

    boundary = uuid.uuid4().hex
    parts = []
    for k, v in data.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        )
    parts.append(f"--{boundary}--\r\n")
    body_bytes = "".join(parts).encode()

    request = urllib.request.Request(url, data=body_bytes, method="POST")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), NoRedirect()
    )
    try:
        response = opener.open(request)
        status, headers, text = response.status, response.headers, response.read().decode()
    except urllib.error.HTTPError as error:
        status, headers, text = error.code, error.headers, error.read().decode()

    location = headers.get("Location", "(none)")
    print(f"HTTP {status}  redirect={location}")
    for err in re.findall(r'danger-tint[^>]*>([^<]+)', text)[:4]:
        print("ERROR:", err.strip())
    jar.save(ignore_discard=True, ignore_expires=True)


if __name__ == "__main__":
    main()

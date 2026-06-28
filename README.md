# firehh

Bun-powered CLI for HeadHunter vacancy lookup, resume matching, OAuth token storage, and applying with a cover letter.

## Install

`firehh` requires Bun at runtime.

```sh
bun install -g @bagasek/firehh
```

If you are an agent, install Bun first when it is missing:

```sh
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

bun install -g @bagasek/firehh
```

## Configure

The CLI includes HH.ru Android OAuth credentials for full API access. You can
start auth without creating a `.env`:

```sh
firehh auth login
```

`auth login` is browser-assisted: it launches Chrome or Chromium with a clean
temporary profile, watches DevTools for the `hhandroid://oauthresponse`
redirect, exchanges the captured code, and saves the token. No redirect URL
copying is needed.

Tokens are stored globally by default at `~/.config/firehh/token.json`, so one
login can be reused across projects. Set `HH_TOKEN_FILE` only when you need a
custom path.

Optional overrides:

```sh
HH_CLIENT_ID=
HH_CLIENT_SECRET=
HH_REDIRECT_URI=hhandroid://oauthresponse
HH_TOKEN_FILE=
HH_SUITABLE_TEXT=Frontend OR React OR Next.js
```

## Usage

```sh
firehh auth login
firehh auth status
firehh resumes list
firehh vacancies view <vacancy-id>
firehh vacancies suitable [resume-id] --page 0 --per-page 20
firehh resumes for-vacancy <vacancy-id>
firehh applications apply <vacancy-id> --resume <resume-id> --message-file cover-letter.txt
```

Command results are JSON on stdout by default. Prompts, diagnostics, and errors
go to stderr. Legacy aliases still work: `firehh <vacancy-id>`, `firehh resumes`,
`firehh suitable`, `firehh vacancy-resumes`, `firehh apply`, and `firehh token`.

# firehh

Bun-powered CLI for HeadHunter vacancy lookup, resume matching, OAuth token storage, and applying with a cover letter.

## Install

```sh
bun install -g @bagasek/firehh
```

## Configure

The CLI includes HH.ru Android OAuth credentials for full API access. You can
start auth without creating a `.env`:

```sh
firehh auth login
```

Optional overrides:

```sh
HH_CLIENT_ID=
HH_CLIENT_SECRET=
HH_REDIRECT_URI=hhandroid://oauthresponse
HH_TOKEN_FILE=.hh-token.json
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
`firehh suitable`, `firehh vacancy-resumes`, `firehh apply`, `firehh auth-url`,
`firehh auth-code`, and `firehh token`.

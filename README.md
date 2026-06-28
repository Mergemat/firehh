# firehh

Bun-powered CLI for HeadHunter vacancy lookup, resume matching, OAuth token storage, and applying with a cover letter.

## Install

```sh
bun install -g firehh
```

## Configure

Copy `.env.example` into your project or shell profile and set:

```sh
HH_CLIENT_ID=
HH_CLIENT_SECRET=
HH_REDIRECT_URI=hhandroid://oauthresponse
HH_TOKEN_FILE=.hh-token.json
HH_SUITABLE_TEXT=Frontend OR React OR Next.js
```

Then authorize:

```sh
firehh auth-url
firehh auth-code '<code-or-redirect-url>'
```

## Usage

```sh
firehh <vacancy-id>
firehh resumes
firehh suitable [resume-id] --page 0 --per-page 20
firehh vacancy-resumes <vacancy-id>
firehh apply <vacancy-id> --resume <resume-id> --message-file cover-letter.txt
firehh token
```

Use `--json` on read commands to print raw API responses.

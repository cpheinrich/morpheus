---
members:
  - github: cpheinrich
    name: Christopher Heinrich
    role: founder
    context: |
      Decides brand, spending, publishing, and anything with a legal surface.
      Prefers three concrete options with a recommendation over an open
      question — his reply time is the bottleneck, not agent generation time.
      Reads on a phone as often as a laptop, so long prose in a terminal is
      lost; long things go in a file he opens in an editor.
    channels:
      github: cpheinrich
---

# Team

Who collaborates on this project, and what an agent should know about working with them.

**This is not an access-control list.** `morpheus.json`'s `hq.allowlist` grants access and is
enforced against Firebase custom claims (§13). Two lists of people, one of which is load-bearing
for auth, is how somebody gets access by editing the wrong file.

`github` doubles as the filename of that person's inbox — `hq/team/<github>.md` — so a handle here
and an inbox there cannot drift.

## The `context` field

The highest-value field, and the only one an agent cannot derive from the repo. It reaches a voice
session's standing explainer and shapes how a reviewer reads a change. Write it as guidance to
somebody who has never worked with this person: what they decide, how they prefer to be asked, and
what makes a message land or get skipped.

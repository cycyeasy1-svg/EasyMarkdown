---
doc_version: 1
doc_status: template
doc_owner: maintainers
last_verified: 2026-08-09
---

# Release Evidence: RELEASE-ID

- Status: Draft
- Decision: BLOCKED
- Owner: unassigned
- Date: YYYY-MM-DD
- Source commit: `COMMIT_SHA`
- Products: PRODUCT／PLATFORM
- Version／Tier: VERSION／TIER

## 1. Scope

- Release goal:
- Included products／platforms:
- Excluded scope and reason:
- Feature Dossier／ADR／migration references:

## 2. Automated gates

| Gate | Run／artifact URL | Result | Verified by／date |
| --- | --- | --- | --- |
| Version／docs／lint／unit／build |  | BLOCKED |  |
| Product integration／E2E |  | BLOCKED |  |
| Release packaging |  | BLOCKED |  |

## 3. Artifact and signing

| Product／platform | Artifact | SHA-256／provenance | Signature／notarization／Store | Result |
| --- | --- | --- | --- | --- |
|  |  |  |  | BLOCKED |

Secret、certificate、password、token の値を記録しない。

## 4. Manual smoke

| Product／OS／device | Clean install | Core flow | Upgrade／data preservation | Uninstall／restore | Result／issue |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | BLOCKED |

Core flow は対象 product の Product Support Matrix に従う。実施しない項目は空欄にせず、理由を記載する。

## 5. Compatibility and known limitations

- Supported baseline:
- Data／settings／file format migration:
- Backward／downgrade compatibility:
- Known limitations and user communication:

## 6. Rollback rehearsal

- Rollback trigger:
- Previous safe release／deployment:
- Artifact withdrawal／Store rollback／hotfix procedure:
- User data recovery／export:
- Rehearsal result:

## 7. Publication decision

- Final decision: `APPROVED`／`REJECTED`／`BLOCKED`
- Decided by／date:
- Release／Store／deployment URL:
- Follow-up issue:

`APPROVED` は Product Support Matrix の必須 gate がすべて成功した場合だけ使用する。

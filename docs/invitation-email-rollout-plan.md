# Staff invitation email slice — 4 November 2026

Owner requests working user addition/email. Preserve the approved invitation activation mechanism: no reusable passwords by email, 24-hour single-use links, Admin proof, existing roles, origin isolation, encrypted queue, bounded retries and immutable evidence.

1. Add a real SMTP transport (Brevo-compatible STARTTLS) alongside isolated test transport. Fail closed without explicit verified sender, HTTPS employee URL, encryption key and private credentials. No outbound mail in tests.
2. Keep network sends outside transactions. Report queued/provider-accepted/failed honestly; SMTP acceptance is not inbox delivery. Stable message IDs and one-use tokens handle uncertain duplicate delivery. Never send isolated queue payloads after switching to SMTP.
3. Make the invitation UI show actual mode and delivery status, auto-refresh pending delivery, and explain that supervised account creation does not email a password. Preserve provisioning until invitation rollout review.
4. Test actual SMTP exchange against an isolated local TLS server, config failures, mail content/escaping, delivery rejection, existing queue/activation/security regressions and browser workflows. Run typecheck/build; commit/push with evidence.

Owner approved local migrations 011/012; applied after private backup and exact preservation verification. API restarted. No operational invitations or emails created. Sender verification, private credentials and employee-accessible APP_PUBLIC_URL remain unresolved; they cannot be fabricated.


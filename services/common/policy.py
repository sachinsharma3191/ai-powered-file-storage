import os

POLICY_DEFAULT_ALLOW = os.getenv("POLICY_DEFAULT_ALLOW", "1") == "1"


def _match_list(val: str | None, patterns: list[str] | None) -> bool:
    if not patterns:
        return True
    if val is None:
        return False
    for p in patterns:
        if p == "*" or p == val:
            return True
    return False


def evaluate(
    policies: list[dict],
    *,
    action: str,
    tenant_id: str,
    role: str | None,
    target: str | None,
    context: dict
) -> dict:
    role = role or ""
    target = target or ""
    ctx = context or {}
    matched_allow = None

    for rule in policies or []:
        eff = (rule.get("effect") or "deny").lower()
        actions = rule.get("actions") or (
            [rule.get("action")] if rule.get("action") else []
        )
        tenants = rule.get("tenants") or (
            [rule.get("tenant")] if rule.get("tenant") else []
        )
        roles = rule.get("roles") or ([rule.get("role")] if rule.get("role") else [])
        targets = rule.get("targets") or (
            [rule.get("target")] if rule.get("target") else []
        )
        when = rule.get("when") or {}

        if actions and not _match_list(action, actions):
            continue
        if tenants and not _match_list(tenant_id, tenants):
            continue
        if roles and not _match_list(role, roles):
            continue
        if targets and not _match_list(target, targets):
            continue

        ok = True
        for k, v in when.items():
            if ctx.get(k) != v:
                ok = False
                break
        if not ok:
            continue

        if eff == "deny":
            return {"allow": False, "matchedRule": rule, "reason": "policy_deny"}
        if eff == "allow":
            matched_allow = rule

    if matched_allow is not None:
        return {"allow": True, "matchedRule": matched_allow, "reason": "policy_allow"}
    return {
        "allow": POLICY_DEFAULT_ALLOW,
        "matchedRule": None,
        "reason": "default_allow" if POLICY_DEFAULT_ALLOW else "default_deny",
    }

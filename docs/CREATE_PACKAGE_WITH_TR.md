# Create ABAP Package and Assign to a Fresh Transport Request (sap-target)

This document captures the full procedure followed in the `mcp-abap-adt` MCP environment to create a new ABAP package on the `sap-target` system and assign it to a freshly created Transport Request (TR), including the errors encountered and how they were resolved.

It is written so that it can be reused as a runbook **and** as a "perfect prompt" template for a future Claude / agent session.

---

## 1. Goal

> Create package `Z10` on the `sap-target` SAP system and assign it to a brand-new transport request.

Concrete success criteria:

- A new TR exists on `sap-target`.
- Package `Z10` exists on `sap-target`.
- Package `Z10` is activated and registered to the new TR.

---

## 2. MCP Tools Used

All tools are exposed by the `sap-target` MCP server (the connected machine the user pointed to).

| Tool | Purpose |
| --- | --- |
| `mcp__sap-target__CreateTransport` | Create a new CTS transport request. Returns the TR number. |
| `mcp__sap-target__CreatePackage` | Create a new ABAP package via ADT. Optionally activates it. |
| `mcp__sap-target__SearchObject` | Quick-search ABAP objects (used to discover candidate parent packages). |
| `mcp__sap-target__GetPackage` | Retrieve details of an existing package. |

Relevant parameters of `CreatePackage`:

- `package_name` *(required)* — e.g. `Z10`.
- `description` *(required)*.
- `super_package` — parent package. Default `$TMP` (local, non-transportable).
- `transport` — required when `super_package` is not `$TMP`.
- `software_component` — default `HOME`.
- `activate` — default `true`.

Relevant parameters of `CreateTransport`:

- `description` *(required)*.
- `type` — `K` Workbench (default), `W` Customizing.
- `target` — transport target system. **Empty** = layer default. **`LOCAL`** = non-transportable local request (still has a TR number, but never leaves the system).
- `owner` — defaults to the logged-in user.

---

## 3. Step-by-Step Procedure (what was actually executed)

### Step 3.1 — Create the TR (first attempt, default target)

```
CreateTransport(description="Package Z10 creation")
=> S4HK905121  (Workbench, target = <default>)
```

### Step 3.2 — Try to create `Z10` under a local parent

```
CreatePackage(package_name="Z10", description="Package Z10",
              transport="S4HK905121", super_package="$ABAP_DEMO")
```

❌ **Failure:**

```
Package "Z10" cannot be assigned to $ABAP_DEMO:
local packages require a name starting with $, # or T.
```

**Why:** `$ABAP_DEMO` is a **local** package (its name starts with `$`). Children of a local package must also be local (name starting with `$`, `#`, or `T`). `Z10` is a customer-namespace transportable name, so it cannot live under `$ABAP_DEMO`.

### Step 3.3 — Try with parent `HOME`

```
CreatePackage(package_name="Z10", ..., transport="S4HK905121", super_package="HOME")
```

❌ **Failure:**

```
Request S4HK905121 is not a local request
T100KEY: CTS_WBO_API 047
namespace referenced: /ZHD2/
```

**Why:** On this target system, the relevant parent package belongs to namespace `/ZHD2/`, which is configured such that subordinate package creation must go through a **LOCAL** request (target = `LOCAL`). Our first TR was created with the default target (transportable), so it was rejected.

### Step 3.4 — Discover a viable customer-namespace parent

```
SearchObject(query="Z*", maxResults=30)
```

The result included an existing transportable customer top-level package: **`Z01`** ("Migration package Z01"). This makes a good parent for `Z10`.

### Step 3.5 — Create a fresh **LOCAL** TR

```
CreateTransport(description="Package Z10 creation (local)", target="LOCAL")
=> S4HK905123  (Workbench, target = LOCAL)
```

### Step 3.6 — Create `Z10` under `Z01`, assigned to the LOCAL TR

```
CreatePackage(package_name="Z10",
              description="Package Z10",
              transport="S4HK905123",
              super_package="Z01")
```

✅ **Success:**

```
Package Z10 created (HTTP 201).
Activation HTTP 200.
```

### Step 3.7 — Cleanup note

The first TR `S4HK905121` was created but never used. It remains open on the system. To remove it, release/delete it via **SE09 / SE10** in SAP GUI or via an MCP transport-management tool if available.

---

## 4. Final State on `sap-target`

| Item | Value |
| --- | --- |
| Transport request used | `S4HK905123` |
| TR type / target | Workbench (`K`) / `LOCAL` |
| TR description | `Package Z10 creation (local)` |
| Package name | `Z10` |
| Package description | `Package Z10` |
| Parent (super) package | `Z01` |
| Software component | `HOME` (default) |
| Activated | Yes (HTTP 200) |
| Unused TR (to clean up) | `S4HK905121` |

---

## 5. Lessons Learned / Rules of Thumb

1. **`$TMP` ⇒ no transport.** If the package goes under `$TMP`, do **not** pass a `transport`; it is rejected.
2. **Local parent ⇒ local child only.** If `super_package` starts with `$`, `#`, or `T`, the new package name must also start with `$`, `#`, or `T`.
3. **Some customer top-level packages on this system require a LOCAL TR.** When you see `ExceptionResourceLockConflict` with text `"Request <X> is not a local request"` and a namespace such as `/ZHD2/`, recreate the TR with `target="LOCAL"` and retry.
4. **Always pick a parent that already exists and is transportable.** Use `SearchObject(query="Z*")` to discover candidates rather than guessing (`HOME`, `SLOC`, etc., may be locked or in restricted namespaces).
5. **TRs are cheap but not free.** A failed `CreatePackage` does **not** delete the TR. Track and clean up unused TRs in SE09/SE10.
6. **Order of operations:** Create the TR first → then create the package referencing the TR. The TR number is required up-front for non-`$TMP` packages.

---

## 6. Decision Flow (quick reference)

```
                ┌──────────────────────────┐
                │ Need a transportable pkg?│
                └─────────────┬────────────┘
                              │ yes
                              ▼
            ┌─────────────────────────────────────┐
            │ Pick parent: existing, non-local,   │
            │ accessible (e.g. Z01).              │
            │ Use SearchObject("Z*") to discover. │
            └─────────────┬───────────────────────┘
                          ▼
              ┌─────────────────────────┐
              │ CreateTransport(...)    │
              │  - default target first │
              └─────────────┬───────────┘
                            ▼
              ┌─────────────────────────┐
              │ CreatePackage(... TR)   │
              └─────────────┬───────────┘
                            ▼
              ┌──────────────────────────────────────────┐
              │ "Request X is not a local request"?      │
              │  → CreateTransport(target="LOCAL")        │
              │  → Retry CreatePackage with new TR        │
              └──────────────────────────────────────────┘
```

---

## 7. Reusable Prompt (drop-in for future sessions)

Copy-paste this prompt into a new Claude / agent session that has the `sap-target` MCP server connected. Replace the placeholders in `<...>`.

> **Task:** On the `sap-target` MCP system, create ABAP package **`<PACKAGE_NAME>`** with description **"`<PACKAGE_DESCRIPTION>`"** and assign it to a **freshly created transport request**.
>
> **Procedure (follow strictly, do not skip steps):**
>
> 1. Load schemas via `ToolSearch` for: `mcp__sap-target__CreateTransport`, `mcp__sap-target__CreatePackage`, `mcp__sap-target__SearchObject`, `mcp__sap-target__GetPackage`.
> 2. If a parent package is **not** specified by me, use `SearchObject(query="Z*", maxResults=30)` to find an existing **transportable customer-namespace** top-level package (e.g. `Z01`) and use it as `super_package`. Do **not** use `$TMP`, `$ABAP_DEMO`, or any name starting with `$`, `#`, `T` (those are local; transportable children are not allowed under them).
> 3. Create a fresh TR with `CreateTransport(description="<PACKAGE_NAME> creation")`. Capture the returned TR number.
> 4. Call `CreatePackage(package_name="<PACKAGE_NAME>", description="<PACKAGE_DESCRIPTION>", transport=<TR>, super_package=<PARENT>)`.
> 5. **Error handling:**
>    - If the response says *"local packages require a name starting with $, # or T"* → switch `super_package` to a non-local parent and retry.
>    - If the response says *"Request <TR> is not a local request"* (often together with a namespace like `/ZHD2/`) → create a new TR with `target="LOCAL"` and retry `CreatePackage` using that LOCAL TR.
>    - For any other error, surface the raw error to me before retrying.
> 6. After success, report:
>    - The TR number actually used (and its target: default vs `LOCAL`).
>    - Any unused/abandoned TRs from earlier failed attempts that I should clean up via SE09/SE10.
>    - Confirmation that the package was activated (HTTP 200 on activation).
>
> **Constraints:**
> - Do **not** modify, delete, or release any existing TRs without my explicit confirmation.
> - Do **not** create the package under `$TMP` — I want it transportable / TR-bound.
> - Keep the response concise: just the final TR number, package name, parent package, activation status, and any TRs to clean up.

---

## 8. Appendix — Raw error texts seen

```
Package "Z10" cannot be assigned to $ABAP_DEMO:
local packages require a name starting with $, # or T.
```

```xml
<exc:exception ...>
  <type id="ExceptionResourceLockConflict"/>
  <message lang="EN">Request S4HK905121 is not a local request</message>
  <properties>
    <entry key="T100KEY-ID">CTS_WBO_API</entry>
    <entry key="T100KEY-NO">047</entry>
    <entry key="T100KEY-V1">S4HK905121</entry>
    <entry key="T100KEY-V3">/ZHD2/</entry>
  </properties>
</exc:exception>
```

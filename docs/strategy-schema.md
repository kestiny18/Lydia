# Strategy Schema

This document defines the minimal strategy file format for Lydia.

## File Location
Default path:
`~/.lydia/strategies/default.yml`

You can override the active strategy in config:
```json
{
  "strategy": {
    "activePath": "C:\\\\Users\\\\me\\\\.lydia\\\\strategies\\\\default.yml"
  }
}
```

You can also manage strategies via CLI:
```bash
lydia strategy list
lydia strategy use path/to/strategy.yml
lydia strategy propose path/to/strategy.yml
lydia strategy proposals
lydia strategy approve 1
lydia strategy reject 1 -r "Reason"
```

## Example
```yaml
id: default
version: "1.0.0"
name: Default Strategy
description: Baseline strategy for safe execution.
preferences:
  autonomy_level: assisted
  confirmation_bias: high
constraints:
  must_confirm:
    - shell_execute
    - fs_write_file
evolution_limits:
  max_delta: 0.1
  cooldown_days: 7
```

## Fields
- `id` (string): Unique identifier for the strategy.
- `version` (string): Strategy version.
- `name` (string): Human-friendly name.
- `description` (string, optional): Strategy description.
- `preferences` (object): Free-form preferences for planners/executors.
- `constraints` (object): Free-form safety constraints.
- `evolution_limits` (object): Future evolution controls.

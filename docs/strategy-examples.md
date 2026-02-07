# Strategy Examples

## Minimal Safe Strategy
```yaml
id: default
version: "1.0.0"
name: Minimal Safe Strategy
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

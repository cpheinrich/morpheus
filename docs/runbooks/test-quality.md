# What makes a test count

**Read this when** writing or reviewing tests, or before claiming a module is "tested". `AGENTS.md` keeps the four rules.

*"Tests for anything testable"* is satisfied by a test that would pass whatever the code did, and
that is the common failure rather than an exotic one. A project repository hit it on the module
its own documentation listed as "working and tested":

```python
def test_sharpe_ratio_positive():
    curve = [Decimal(str(100 + i)) for i in range(253)]   # monotonically rising
    assert sr > 0                                          # any positive number passes
```

At 87% line coverage, mutation testing showed that adding the risk-free rate instead of
subtracting it, dividing by the annualization factor instead of multiplying, and counting flat
periods as downside **all passed the suite**. The one test in that file which pinned a number was
the one test whose mutant died.

**Assert the value, not the sign.** A test that would still pass if the answer were wrong is not
a test, whatever it does to the coverage percentage. `> 0`, `!= 0`, `is not None` and "did not
raise" are shapes to be suspicious of — legitimate sometimes, and worth a second look every time.

**Test a guard at its boundary.** `x <= 0` and `x < 0` differ at exactly zero and nowhere else, so
a guard exercised only with `-1` is not exercised.

**A comment saying "never do X" needs a test that fails when X is done.** An invariant stated only
in prose is a convention; one with a test behind it is a constraint, and the difference is
invisible until someone breaks it.

**Coverage is a floor against deletion, not evidence of quality.** Gate it under the measured
number so it catches tests being removed, and do not raise it as a proxy for the suite getting
better — that is the metric being chased rather than the property being bought. `python-ci.yml`
defaults `coverage-fail-under` to 0 for the same reason.

**To check rather than assume, run mutation testing** — break the source, run the suite, see what
it fails to notice. Keep it out of CI: it is slow, and a mutation score turned into a gate gets
chased exactly like a coverage target. Read survivors instead of counting them, because a mutant
survives for three reasons and only the first is a test gap:

1. nothing tests that behaviour — write the test;
2. the mutation changes nothing observable — an equivalent mutant, and every codebase has some;
3. something else refuses first — defence in depth, so the guard is untested but the system is
   safe, which is the thing to write down.

A cheap proxy that costs one AST walk: **assertions per test**. In the audit above, the file with
the lowest density in the suite was the file with the worst mutation score.

Worked example, with the harness, the findings and the two mistakes made while fixing them:
[`qa/audits/2026-08-19-python-test-quality.md`](https://github.com/cpheinrich/lakinacapital/blob/main/qa/audits/2026-08-19-python-test-quality.md)
and [`qa/mutation/`](https://github.com/cpheinrich/lakinacapital/tree/main/qa/mutation) in Lakina.

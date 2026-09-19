# Activated 7-Day Trial Experiment

## Purpose

Test whether starting a trial after a user reaches a first useful result improves
activation and paid conversion without changing the experience of existing users.

## Guardrails

- The experiment is disabled by default.
- Existing users and existing trial records are never reassigned.
- Only new trial claims made after an admin enables the experiment receive a sticky assignment.
- The control variant keeps the configured standard trial duration.
- The activated variant receives a 7-day trial only after `obs_connected` or a first-use event.
- Beta users are explicitly marked by an admin and receive the beta duration; they are not included in the activated-vs-control comparison.

## Primary hypothesis

Users who receive the trial at the moment they see value will be more likely to
pay, without materially reducing first-use completion or increasing support and
exit-survey complaints.

## Metrics

- Primary: paid conversion from assigned eligible user.
- Secondary: OBS connection, first useful use, return within 7 days, paywall view,
  checkout start, time to first useful use.
- Guardrails: activation-survey reasons, payment failures, trial-expiry rate,
  support volume, and refund/cancellation signals.

## Rollout

1. Keep the experiment disabled while validating event quality in the Activation
   admin report.
2. Add a small beta cohort and verify the activated-trial lifecycle end to end.
3. Enable the experiment at the default 50% activated / 50% control allocation.
4. Review at least 100 eligible users per comparison variant or four weeks of
   data, whichever comes later. Treat earlier numbers as directional only.
5. Do not change duration or allocation mid-readout; create a new experiment ID
   for a materially different test.

The admin controls live at `/admin/activation`. The event definitions and cohort
counts shown there are the source of truth for the readout.

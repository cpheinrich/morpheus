// Both providers read the same hook output shape: `systemMessage` is shown to the user, and
// `hookSpecificOutput.additionalContext` reaches the model.
export function hookOutput(event, result) {
  const output = {};
  if (result.systemMessage) output.systemMessage = result.systemMessage;
  if (result.additionalContext)
    output.hookSpecificOutput = {
      hookEventName: event,
      additionalContext: result.additionalContext,
    };
  if (Object.keys(output).length) console.log(JSON.stringify(output));
}

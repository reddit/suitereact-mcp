/** Error name for expected denials whose message is safe to show the user. */
export const ACTION_DENIED = 'ACTION_DENIED';

/**
 * An expected business denial (for example a segregation-of-duties check).
 * The action handler returns its message to the client; every other exception
 * stays a generic failure. Pass only fixed, user-facing text.
 */
export function actionDenied(message: string): Error {
  const error = new Error(message);
  error.name = ACTION_DENIED;
  return error;
}

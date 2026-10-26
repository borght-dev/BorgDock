type CommandResult<T, E> = { status: 'ok'; data: T } | { status: 'error'; error: E };

export async function commandData<T, E>(result: Promise<CommandResult<T, E>>): Promise<T> {
  const reply = await result;
  if (reply.status === 'error') throw reply.error;
  return reply.data;
}

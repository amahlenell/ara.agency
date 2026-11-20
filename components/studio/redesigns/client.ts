export async function responseJson(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'This action could not be completed.');
  return result;
}
export function studioRequest(url: string, method: string, body: unknown) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(responseJson);
}

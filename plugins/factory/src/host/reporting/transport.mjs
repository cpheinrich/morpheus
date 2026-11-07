// Shared bounded decoding for authenticated read-only adapters. Response bodies stay in memory.
export async function boundedJson(response,maxBytes=524288) {
  if(!response.ok)throw new Error('unavailable');
  const chunks=[];let size=0;
  for await(const chunk of response.body) {
    size+=chunk.length;
    if(size>maxBytes)throw new Error('unavailable');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

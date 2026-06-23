/**
 * Atașament asociat unui task (imagine sau notă vocală).
 *
 * `data` este un data-URL base64 (ex: `data:image/png;base64,...` sau
 * `data:audio/webm;base64,...`). Poate lipsi sau fi `[]` când nu există niciunul.
 */
export interface Attachment {
  type: 'image' | 'audio';
  data: string;
  caption?: string | null;
}

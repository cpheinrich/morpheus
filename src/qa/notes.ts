import { z } from "zod";

export const QA_NOTES_MAX_CHARS = 2000;
export const QaNotes = z.string().trim().min(1).max(QA_NOTES_MAX_CHARS).optional();

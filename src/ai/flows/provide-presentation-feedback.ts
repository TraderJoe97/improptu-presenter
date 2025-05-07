'use server';

/**
 * @fileOverview An AI agent that provides feedback on a presentation based on audio recording.
 *
 * - providePresentationFeedback - A function that handles the presentation feedback process.
 * - ProvidePresentationFeedbackInput - The input type for the providePresentationFeedback function.
 * - ProvidePresentationFeedbackOutput - The return type for the providePresentationFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProvidePresentationFeedbackInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "A recording of the presentation audio, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  topic: z.string().describe('The topic of the presentation.'),
});
export type ProvidePresentationFeedbackInput = z.infer<
  typeof ProvidePresentationFeedbackInputSchema
>;

const ProvidePresentationFeedbackOutputSchema = z.object({
  clarityFeedback: z.string().describe('Feedback on the clarity of the presentation.'),
  pacingFeedback: z.string().describe('Feedback on the pacing of the presentation.'),
  contentRelevanceFeedback:
    z.string().describe('Feedback on the content relevance to the topic.'),
  overallFeedback: z.string().describe('Overall feedback on the presentation.'),
});
export type ProvidePresentationFeedbackOutput = z.infer<
  typeof ProvidePresentationFeedbackOutputSchema
>;

export async function providePresentationFeedback(
  input: ProvidePresentationFeedbackInput
): Promise<ProvidePresentationFeedbackOutput> {
  return providePresentationFeedbackFlow(input);
}

const providePresentationFeedbackPrompt = ai.definePrompt({
  name: 'providePresentationFeedbackPrompt',
  input: {schema: ProvidePresentationFeedbackInputSchema},
  output: {schema: ProvidePresentationFeedbackOutputSchema},
  prompt: `You are an AI agent providing feedback on presentations. Analyze the presentation recording and provide feedback on clarity, pacing, and content relevance to the topic.

Presentation Topic: {{{topic}}}

Presentation Audio: {{media url=audioDataUri}}

Provide detailed feedback on the following aspects:

- Clarity: How clear and easy to understand was the presentation?
- Pacing: Was the presentation too fast, too slow, or just right?
- Content Relevance: How relevant was the content to the presentation topic?

Also, provide an overall feedback summary.`,
});

const providePresentationFeedbackFlow = ai.defineFlow(
  {
    name: 'providePresentationFeedbackFlow',
    inputSchema: ProvidePresentationFeedbackInputSchema,
    outputSchema: ProvidePresentationFeedbackOutputSchema,
  },
  async input => {
    const {output} = await providePresentationFeedbackPrompt(input);
    return output!;
  }
);

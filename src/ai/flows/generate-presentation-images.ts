// src/ai/flows/generate-presentation-images.ts
'use server';
/**
 * @fileOverview Image generation flow for presentation slideshows.
 *
 * - generatePresentationImages - A function that generates images based on the topic of the presentation.
 * - GeneratePresentationImagesInput - The input type for the generatePresentationImages function.
 * - GeneratePresentationImagesOutput - The return type for the generatePresentationImages function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeneratePresentationImagesInputSchema = z.object({
  topic: z.string().describe('The topic of the presentation.'),
});
export type GeneratePresentationImagesInput = z.infer<typeof GeneratePresentationImagesInputSchema>;

const GeneratePresentationImagesOutputSchema = z.object({
  image1: z.string().describe('The first generated image data URI.'),
  image2: z.string().describe('The second generated image data URI.'),
  image3: z.string().describe('The third generated image data URI.'),
});
export type GeneratePresentationImagesOutput = z.infer<typeof GeneratePresentationImagesOutputSchema>;

export async function generatePresentationImages(
  input: GeneratePresentationImagesInput
): Promise<GeneratePresentationImagesOutput> {
  return generatePresentationImagesFlow(input);
}

const generatePresentationImagesFlow = ai.defineFlow(
  {
    name: 'generatePresentationImagesFlow',
    inputSchema: GeneratePresentationImagesInputSchema,
    outputSchema: GeneratePresentationImagesOutputSchema,
  },
  async input => {
    const image1Response = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: `Generate an image related to: ${input.topic}. This image should represent a key aspect of the topic.`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const image2Response = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: `Generate another image related to: ${input.topic}. This image should represent a different key aspect of the topic.`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const image3Response = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: `Generate a third image related to: ${input.topic}. This image should represent a yet another key aspect of the topic.`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    return {
      image1: image1Response.media!.url,
      image2: image2Response.media!.url,
      image3: image3Response.media!.url,
    };
  }
);

import type { Task } from '../strategy/types.js';
import type { TaskReport } from '../reporting/reporter.js';

export interface TaskFeedback {
  taskId: string;
  rating?: 'positive' | 'neutral' | 'negative';
  comment?: string;
  corrections?: string[];
  createdAt: number;
}

export class FeedbackCollector {
  async collect(task: Task, report: TaskReport, askUser?: (prompt: string) => Promise<string>): Promise<TaskFeedback | null> {
    if (!askUser) return null;

    const prompt = [
      `Please provide feedback for task ${task.id}.`,
      `Summary: ${report.summary}`,
      '',
      'Reply format (one line):',
      'rating=<positive|neutral|negative>; comment=<optional>',
      'Example: rating=positive; comment=Looks good.',
      ''
    ].join('\n');

    const response = (await askUser(prompt)).trim();
    if (!response) return null;

    let rating: TaskFeedback['rating'];
    let comment: string | undefined;

    const parts = response.split(';').map(p => p.trim());
    for (const part of parts) {
      const [key, ...rest] = part.split('=');
      if (!key || rest.length === 0) continue;
      const value = rest.join('=').trim();
      if (key === 'rating') {
        if (value === 'positive' || value === 'neutral' || value === 'negative') {
          rating = value;
        }
      } else if (key === 'comment') {
        comment = value;
      }
    }

    if (!rating && !comment) {
      comment = response;
    }

    return {
      taskId: task.id,
      rating,
      comment,
      createdAt: Date.now()
    };
  }
}


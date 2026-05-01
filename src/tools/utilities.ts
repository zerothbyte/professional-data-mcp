/**
 * Utility tools for system information like time and date.
 */

export const utilityToolDefs = [
  {
    name: "utilities_get_current_time",
    description:
      "Returns the current system date and time. Use this tool whenever you need to know 'today', 'now', or calculate relative dates like 'last week' or 'next month'.",
    inputSchema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "Optional timezone (e.g., 'Asia/Jakarta', 'UTC')",
        },
      },
    },
  },
];

export async function handleUtilities(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "utilities_get_current_time":
      return getCurrentTime(args.timezone);
    default:
      throw new Error(`Unknown utility tool: ${toolName}`);
  }
}

function getCurrentTime(timezone?: string): string {
  const now = new Date();
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };

  if (timezone) {
    try {
      options.timeZone = timezone;
    } catch (e) {
      return `❌ Invalid timezone provided: ${timezone}`;
    }
  }

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const formattedDate = formatter.format(now);
  const isoString = now.toISOString();

  return JSON.stringify({
    formatted: formattedDate,
    iso: isoString,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    note: "Use the ISO date for precise calculations and the formatted date for human-readable output."
  }, null, 2);
}

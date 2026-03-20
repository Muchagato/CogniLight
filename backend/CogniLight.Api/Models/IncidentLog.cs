namespace CogniLight.Api.Models;

public class IncidentLog
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; }
    public required string PoleId { get; set; }
    public required string Author { get; set; }
    public required string Category { get; set; }  // maintenance, inspection, incident, repair, scheduled
    public required string Text { get; set; }
}

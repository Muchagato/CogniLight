using Microsoft.AspNetCore.SignalR;

namespace CogniLight.Api.Hubs;

public class TelemetryHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }
}

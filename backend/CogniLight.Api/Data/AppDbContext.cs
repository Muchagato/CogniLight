using CogniLight.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CogniLight.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<TelemetryReading> TelemetryReadings => Set<TelemetryReading>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TelemetryReading>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.PoleId);
            entity.HasIndex(e => e.Timestamp);
            entity.Property(e => e.PoleId).HasMaxLength(10);
            entity.Property(e => e.AnomalyDescription).HasMaxLength(256);
        });
    }
}

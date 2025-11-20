import SellZone from '../SellZone';

export default function SellZoneExample() {
  return (
    <div className="p-8 bg-background flex gap-4">
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Normal State</h3>
        <SellZone onDrop={(card) => console.log('Sold:', card)} />
      </div>
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Drop Target</h3>
        <SellZone isDropTarget={true} />
      </div>
    </div>
  );
}

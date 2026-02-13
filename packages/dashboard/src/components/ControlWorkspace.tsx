import { Panel } from './ui/Panel';
import { SettingsLayout } from './SettingsLayout';

export function ControlWorkspace() {
    return (
        <div className="h-full p-6">
            <Panel
                title="Control Center"
                subtitle="Strategy governance, approvals, MCP health, and system configuration."
                className="h-full flex flex-col"
            >
                <div className="h-[calc(100vh-220px)]">
                    <SettingsLayout mode="control" />
                </div>
            </Panel>
        </div>
    );
}


import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Strategy, StrategySchema } from './strategy.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface StrategyBranch {
    name: string;
    version: string;
    path: string;
    parent?: string;
    createdAt: number;
}

export class StrategyBranchManager {
    private baseDir: string;

    constructor(baseDir?: string) {
        this.baseDir = baseDir || path.join(os.homedir(), '.lydia', 'strategies');
    }

    async init() {
        await fs.mkdir(this.baseDir, { recursive: true });
        await fs.mkdir(path.join(this.baseDir, 'branches'), { recursive: true });
        await fs.mkdir(path.join(this.baseDir, 'archive'), { recursive: true });
    }

    async listBranches(): Promise<StrategyBranch[]> {
        const branchesDir = path.join(this.baseDir, 'branches');
        try {
            const entries = await fs.readdir(branchesDir, { withFileTypes: true });
            const branches: StrategyBranch[] = [];

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                // Each branch is a directory containing versions
                // We look for the 'head.yml' or similar, or just the latest version file?
                // Let's stick to simple file-based for now: branches/experiment-A.yml
                // But better: branches/experiment-A/v1.yml

                // Simplified approach for MVP:
                // .lydia/strategies/branches/<branch_name>.yml
            }

            // Let's re-read directory for flat file approach
            const files = await fs.readdir(branchesDir);
            for (const file of files) {
                if (!file.endsWith('.yml')) continue;

                const content = await fs.readFile(path.join(branchesDir, file), 'utf-8');
                try {
                    const strategy = StrategySchema.parse(parseYaml(content));
                    branches.push({
                        name: strategy.metadata.id, // ID is used as branch name effectively
                        version: strategy.metadata.version,
                        path: path.join(branchesDir, file),
                        parent: strategy.metadata.inheritFrom,
                        createdAt: Date.now() // We might want to store this in metadata later
                    });
                } catch (e) {
                    console.warn(`Failed to parse branch ${file}:`, e);
                }
            }
            return branches;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        }
    }

    async createBranch(
        sourceStrategy: Strategy,
        newBranchName: string,
        modifications: Partial<Strategy>
    ): Promise<Strategy> {
        const targetDir = path.join(this.baseDir, 'branches');
        await fs.mkdir(targetDir, { recursive: true });

        // Deep merge logic would be ideal here, but for now simple spread
        // Note: This is shallow merge for top-level keys. 
        // Real implementation needs deep merge.
        const newStrategy: Strategy = {
            ...sourceStrategy,
            ...modifications,
            metadata: {
                ...sourceStrategy.metadata,
                id: newBranchName,
                inheritFrom: sourceStrategy.metadata.id,
                // Increment version? Or keep same? 
                // For a new branch, maybe reset to 1.0.0-branch-name?
                version: `${sourceStrategy.metadata.version}-${newBranchName}`,
                ...modifications.metadata
            }
        };

        const filePath = path.join(targetDir, `${newBranchName}.yml`);
        await fs.writeFile(filePath, stringifyYaml(newStrategy), 'utf-8');

        return newStrategy;
    }

    async getBranch(branchName: string): Promise<Strategy | null> {
        const filePath = path.join(this.baseDir, 'branches', `${branchName}.yml`);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return StrategySchema.parse(parseYaml(content));
        } catch {
            return null;
        }
    }

    async mergeBranch(branchName: string): Promise<void> {
        const branch = await this.getBranch(branchName);
        if (!branch) throw new Error(`Branch ${branchName} not found`);

        // Determine target. For now, we assume we are merging BACK into the parent 
        // or if parent is null, into 'default'.
        // In our createBranch logic: inheritFrom = sourceStrategy.metadata.id

        // We need to resolve the ID to a file path. 
        // This is tricky if we don't know where the parent is.
        // Simplified MVP: We only support merging into 'default' strategy for now, 
        // or we just make this branch the NEW default?

        // Strategy:
        // 1. Archive the current strategy that this branch modifies.
        // 2. Overwrite that strategy file with this branch's content.

        // But wait, the branch file itself is a valid strategy file.
        // Maybe we just say "Promote to Active"?

        // Let's implement: Overwrite Parent
        const parentId = branch.metadata.inheritFrom;
        if (!parentId) throw new Error("Branch has no parent to merge into");

        // Find parent file
        // We need a way to look up file by ID. StrategyRegistry does this but we are in BranchManager.
        // Let's assume standard location for now or verify against listBranches?
        // Actually, BranchManager should probably delegate "Apply" to the Registry or just manage files.

        // MVP Hack: We assume the parent is in the baseDir (root of strategies) or we rely on the user to manually switch.
        // BETTER MVP: We simply rename the branch file to be the new "default.yml" inside the user's config?
        // No, that breaks if multiple agents use different files.

        // Let's go with: Backup Parent -> Overwrite Parent.
        // We need to find the parent file path. 
        // We'll scan the baseDir for the parent ID.

        const files = await fs.readdir(this.baseDir);
        let parentFile: string | null = null;

        for (const file of files) {
            if (file === 'branches' || file === 'archive') continue;
            // Check if file has the parent ID
            try {
                const content = await fs.readFile(path.join(this.baseDir, file), 'utf-8');
                const data = parseYaml(content);
                if (data.metadata?.id === parentId) {
                    parentFile = file;
                    break;
                }
            } catch { }
        }

        if (!parentFile) {
            throw new Error(`Parent strategy ${parentId} not found in ${this.baseDir}`);
        }

        const parentPath = path.join(this.baseDir, parentFile);

        // 1. Archive Parent
        await fs.copyFile(parentPath, path.join(this.baseDir, 'archive', `${parentId}-${Date.now()}.bak.yml`));

        // 2. Update Branch Metadata (Remove 'experiment' tags, update version?)
        // For now, keep as is, just mark as merged?
        const start = Date.now();

        // 3. Overwrite Parent with Branch Content
        // We read the branch again to ensure we have latest text
        const branchContent = await fs.readFile(path.join(this.baseDir, 'branches', `${branchName}.yml`), 'utf-8');
        await fs.writeFile(parentPath, branchContent, 'utf-8');

        // 4. Archive Branch File (Cleanup)
        await this.archiveBranch(branchName);
    }

    async archiveBranch(branchName: string) {
        const srcPath = path.join(this.baseDir, 'branches', `${branchName}.yml`);
        const destPath = path.join(this.baseDir, 'archive', `${branchName}-${Date.now()}.yml`);

        try {
            await fs.rename(srcPath, destPath);
        } catch (e) {
            console.error(`Failed to archive branch ${branchName}:`, e);
            throw e;
        }
    }
}

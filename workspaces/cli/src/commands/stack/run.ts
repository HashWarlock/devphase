import { BaseCommand } from '@/base/BaseCommand';
import { RunMode, StackManager } from '@devphase/service';
import { Flags } from '@oclif/core';


export class StackRunCommand
    extends BaseCommand<typeof StackRunCommand>
{
    
    public static summary : string = 'Starts local development stack';
    
    public static flags = {
        'save-logs': Flags.boolean({
            summary: 'Save logs to file',
            default: false
        }),
        timelimit: Flags.integer({
            summary: 'Execution time limit (ms)',
            default: 0
        }),
    };
    
    
    public async run ()
    {
        await this.runtimeContext.initContext(RunMode.Simple);
        await this.runtimeContext.requestProjectDirectory();
        await this.runtimeContext.requestStackBinaries();
        
        const stackManager = new StackManager(this.runtimeContext);
        
        try {
            await stackManager.startStack(
                RunMode.Simple,
                {
                    saveLogs: this.flags['save-logs'],
                }
            );
        }
        catch (e) {
            await stackManager.stopStack();
            throw e;
        }
        
        process.on('SIGINT', async() => {
            this._logger.warn('Got SIGINT - shutting down');
            
            await stackManager.stopStack();
        });
        
        const timelimit = Number(this.flags.timelimit);
        if (timelimit) {
            setTimeout(async() => {
                this._logger.log('Time limit reached');
                await stackManager.stopStack();
                
                this.exit(0);
            }, timelimit);
        }
    }
    
}

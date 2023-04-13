import { RunMode, RuntimeContext, StackManager, VerbosityLevel, Logger } from '@devphase/service';
import { expect, test } from '@oclif/test';
import chalk from 'chalk';
import { cleanUpContext, createConfigFile } from '../before-all.test';


function optionalCheck (haystack : string, needle : string)
{
    expect(haystack).to.satisfy(haystack => {
        return [
            needle + ' [skipped]',
            needle + ' [completed]',
        ].find(needle => haystack.includes(needle)) !== undefined;
    }, `Satisfy ${needle} in haystack`);
}


describe('Command ' + chalk.cyan('stack run'), () => {
    beforeEach(async() => {
        await cleanUpContext([
            '.gitignore',
            '.devphase',
            'contracts',
            'stacks',
            'tests'
        ]);
        
        await createConfigFile({
            stack: {
                blockTime: 100,
            }
        });
    });
    
    let runtimeContext : RuntimeContext;
    let stackManager : StackManager;
    
    beforeEach(async function() {
        this.timeout(20_000);
        
        // start stack
        runtimeContext = await RuntimeContext.getSingleton();
        
        Logger.LOGGER_LEVEL = VerbosityLevel.Silent;
        runtimeContext.setVerbosityLevel(VerbosityLevel.Silent);
        
        await runtimeContext.initContext(RunMode.Simple);
        await runtimeContext.requestProjectDirectory();
        await runtimeContext.requestStackBinaries();
        
        stackManager = new StackManager(runtimeContext);
        
        try {
            await stackManager.startStack(
                RunMode.Simple,
                { saveLogs: false }
            );
        }
        catch (e) {
            await stackManager.stopStack();
            throw e;
        }
    });
    
    afterEach(async function() {
        if (stackManager) {
            await stackManager.stopStack(true);
        }
    });
    
    
    const pTest = test
        .stdout()
    ;
    
    pTest
        .timeout(15_000)
        .command([ 'stack setup', '-m=1', '-v' ])
        .it(`Should properly setup stack in Minimal mode`, ctx => {
            optionalCheck(ctx.stdout, 'Fetch worker info');
            optionalCheck(ctx.stdout, 'Load system contracts');
            optionalCheck(ctx.stdout, 'Register worker');
            optionalCheck(ctx.stdout, 'Register gatekeeper');
            optionalCheck(ctx.stdout, 'Upload Pink system code');
            optionalCheck(ctx.stdout, 'Verify cluster');
            optionalCheck(ctx.stdout, 'Create cluster');
            optionalCheck(ctx.stdout, 'Wait for cluster to be ready');
            optionalCheck(ctx.stdout, 'Create system contract API');
            
            expect(ctx.stdout).to.include('Stack is ready');
        })
    ;
});

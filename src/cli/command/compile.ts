import { ContractCompiler } from '@/service/ContractCompiler';
import { MultiContractExecutor } from '@/service/MultiContractExecutor';
import { RuntimeContext } from '@/service/RuntimeContext';
import { Logger } from '@/utils/Logger';
import { Command } from 'commander';


type CommandOptions = {
    watch : boolean,
    release : boolean,
}

async function command (
    runtimeContext : RuntimeContext,
    contractName? : string,
    options? : CommandOptions
)
{
    const logger = new Logger('Compile');
    
    logger.log('Contracts compilation');
    
    const contractCompiler = new ContractCompiler(runtimeContext);
    const multiContractExecutor = new MultiContractExecutor(runtimeContext);
    
    return multiContractExecutor.exec(
        contractName,
        options.watch,
        (contractName) => {
            return contractCompiler.compile(
                contractName,
                options.release
            );
        }
    );
}

export function compileCommand (
    program : Command,
    context : RuntimeContext
)
{
    program.command('compile')
        .description('Compile contract(s)')
        .argument('[contractName]', 'Optional name of contract to compile', null)
        .option('-w, --watch', 'Watch for changes', false)
        .option('-r, --release', 'Compile in release mode', false)
        .action(async(...args : any[]) => command(context, ...args));
}
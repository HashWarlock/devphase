import { ContractCompiler } from '@/service/ContractCompiler';
import { RuntimeContext } from '@/service/RuntimeContext';
import { Logger } from '@/utils/Logger';
import { Command } from 'commander';


async function command (
    runtimeContext : RuntimeContext,
    contractName? : string
)
{
    const logger = new Logger('Compile');
    
    logger.log('Contracts compilation');
    
    const contractCompiler = new ContractCompiler(runtimeContext);
    
    return contractCompiler.compileAll(contractName);
}

export function compileCommand (
    program : Command,
    context : RuntimeContext
)
{
    program.command('compile')
        .description('Compile contract(s)')
        .argument('[contractName]', 'Optional name of contract to compile', null)
        .action(async(...args : any[]) => command(context, ...args));
}

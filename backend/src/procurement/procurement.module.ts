import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementConversation } from './entities/procurement-conversation.entity';
import { ProcurementMessage } from './entities/procurement-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcurementConversation, ProcurementMessage])],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}

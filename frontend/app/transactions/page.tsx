"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TransactionsPage() {
  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">ТРАНЗАКЦИИ</CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-medium text-muted-foreground">
                  Дата
                </TableHead>
                <TableHead className="font-medium text-muted-foreground">
                  Тип
                </TableHead>
                <TableHead className="font-medium text-muted-foreground">
                  Описание
                </TableHead>
                <TableHead className="text-right font-medium text-muted-foreground">
                  Сумма
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  Пока нет записей
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}